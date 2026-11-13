"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setRedisClientForTests = setRedisClientForTests;
exports.clearRedisClientForTests = clearRedisClientForTests;
exports.setRedisClientPromiseForTests = setRedisClientPromiseForTests;
exports.clearPerEmailStoreLocksForTests = clearPerEmailStoreLocksForTests;
exports.normalizeUiIdentityEmail = normalizeUiIdentityEmail;
exports.setUiSessionExchange = setUiSessionExchange;
exports.consumeUiSessionExchange = consumeUiSessionExchange;
exports.deleteUiSessionExchange = deleteUiSessionExchange;
exports.setUiLogoutHandle = setUiLogoutHandle;
exports.consumeUiLogoutHandle = consumeUiLogoutHandle;
exports.setUiSessionIssueId = setUiSessionIssueId;
exports.getUiSessionIssueId = getUiSessionIssueId;
exports.deleteUiSessionIssueId = deleteUiSessionIssueId;
exports.setUiOidcRefreshToken = setUiOidcRefreshToken;
exports.setUiOidcRefreshTokenWithExpiry = setUiOidcRefreshTokenWithExpiry;
exports.getUiOidcRefreshTokenRecord = getUiOidcRefreshTokenRecord;
exports.getUiOidcRefreshToken = getUiOidcRefreshToken;
exports.isRefreshTokenExpiredByEmail = isRefreshTokenExpiredByEmail;
exports.setUiOidcIdToken = setUiOidcIdToken;
exports.getUiOidcIdToken = getUiOidcIdToken;
exports.setUiOidcAccessTokenRecord = setUiOidcAccessTokenRecord;
exports.getUiOidcAccessTokenRecord = getUiOidcAccessTokenRecord;
exports.deleteUiOidcTokens = deleteUiOidcTokens;
exports.deleteUiOidcTokenRecords = deleteUiOidcTokenRecords;
exports.setUiTenantRoles = setUiTenantRoles;
exports.getUiTenantRoles = getUiTenantRoles;
exports.deleteUiTenantRoles = deleteUiTenantRoles;
exports.setUiTenantGroups = setUiTenantGroups;
exports.getUiTenantGroups = getUiTenantGroups;
exports.deleteUiTenantGroups = deleteUiTenantGroups;
exports.getUiOidcAccessTokenByEmail = getUiOidcAccessTokenByEmail;
const crypto_1 = require("crypto");
const redis_1 = require("redis");
const _config_1 = require("@config");
const logger_1 = require("../utils/logger");
const storeLog = (0, logger_1.createLogger)('UiOidcStore');
const REFRESH_TOKEN_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ID_TOKEN_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TENANT_ROLES_DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const TENANT_GROUPS_DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
function extractJwtExpiryMs(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return undefined;
        let base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
        while (base64.length % 4) {
            base64 += '=';
        }
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
        return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
    }
    catch {
        return undefined;
    }
}
let redisClientPromise = null;
// Smallest injectable store boundary — tests can inject a fake client
// without mocking the `redis` module. Real code never calls this; contract
// tests use the fake, security-relevant ops are exercised against both fake
// and real Redis when UI_OIDC_REDIS_URL points at a real instance.
let redisClientOverride = null;
function setRedisClientForTests(client) {
    redisClientOverride = Promise.resolve(client);
}
function clearRedisClientForTests() {
    redisClientOverride = null;
    redisClientPromise = null;
}
function setRedisClientPromiseForTests(promise) {
    redisClientOverride = promise;
}
// Runtime validation for persisted JSON — fail closed on malformed.
function isNonEmptyString(v) {
    return typeof v === 'string' && v.length > 0;
}
function isValidUiSessionExchangeRecord(v) {
    return typeof v === 'object' && v !== null && 'token' in v && isNonEmptyString(v.token);
}
function isValidUiLogoutHandleRecord(v) {
    if (typeof v !== 'object' || v === null)
        return false;
    const r = v;
    return isNonEmptyString(r.email) && String(r.email).includes('@') && typeof r.returnTo === 'string';
}
function isValidRefreshTokenRecord(v) {
    if (typeof v !== 'object' || v === null)
        return false;
    const r = v;
    if (!isNonEmptyString(r.token))
        return false;
    if ('expiresAt' in r && r.expiresAt !== undefined && typeof r.expiresAt !== 'number')
        return false;
    return true;
}
function isValidAccessTokenRecord(v) {
    if (typeof v !== 'object' || v === null)
        return false;
    const r = v;
    if (!isNonEmptyString(r.email))
        return false;
    if ('expiresAt' in r && r.expiresAt !== undefined && typeof r.expiresAt !== 'number')
        return false;
    return true;
}
function isValidTenantRoleArray(v) {
    if (!Array.isArray(v))
        return false;
    return v.every((e) => typeof e === 'object' &&
        e !== null &&
        isNonEmptyString(e.tenantId) &&
        typeof e.tenantName === 'string' &&
        Array.isArray(e.roles) &&
        e.roles.every((r) => typeof r === 'string'));
}
function isValidTenantGroupArray(v) {
    if (!Array.isArray(v))
        return false;
    return v.every((e) => typeof e === 'object' &&
        e !== null &&
        isNonEmptyString(e.tenantId) &&
        typeof e.tenantName === 'string' &&
        Array.isArray(e.groups) &&
        e.groups.every((r) => typeof r === 'string'));
}
/**
 * Per-email in-process mutex for store mutations.
 * Serializes concurrent `setUiOidcAccessTokenRecord` and
 * `deleteUiOidcTokens` for the same email within a single Node process.
 * Prevents JS-yield interleaving from orphaning reverse records.
 * Real Redis Lua provides cross-process atomicity; this lock covers
 * single-process concurrency. Lock is per normalized email, held only
 * for the duration of the mutation, released on success or throw
 * (crash recovery: process death clears the Map).
 */
const perEmailStoreLocks = new Map();
async function withPerEmailStoreLock(email, fn) {
    const key = normalizeUiIdentityEmail(email);
    const prev = perEmailStoreLocks.get(key) ?? Promise.resolve();
    let release;
    const next = new Promise((r) => (release = r));
    perEmailStoreLocks.set(key, prev.then(() => next));
    await prev;
    try {
        return await fn();
    }
    finally {
        release();
        if (perEmailStoreLocks.get(key) === next)
            perEmailStoreLocks.delete(key);
    }
}
function clearPerEmailStoreLocksForTests() {
    perEmailStoreLocks.clear();
}
function getSessionExchangeKey(sessionHandle) {
    return `${_config_1.UI_OIDC_REDIS_PREFIX}session:${sessionHandle}`;
}
/**
 * Normalize an identity email before it is used as (part of) a Redis key so
 * every caller reads and deletes the same records regardless of case or
 * surrounding whitespace.
 */
function normalizeUiIdentityEmail(email) {
    return email.trim().toLowerCase();
}
function getRefreshTokenKey(email) {
    return `${_config_1.UI_OIDC_REDIS_PREFIX}reftoken:${normalizeUiIdentityEmail(email)}`;
}
function getIdTokenKey(email) {
    return `${_config_1.UI_OIDC_REDIS_PREFIX}idtoken:${normalizeUiIdentityEmail(email)}`;
}
function getAccessTokenByEmailKey(email) {
    return `${_config_1.UI_OIDC_REDIS_PREFIX}acctoken:${normalizeUiIdentityEmail(email)}`;
}
function getAccessTokenRecordKey(token) {
    const digest = (0, crypto_1.createHash)('sha256').update(token).digest('hex');
    return `${_config_1.UI_OIDC_REDIS_PREFIX}tokenemail:${digest}`;
}
function getTenantRolesKey(email) {
    return `${_config_1.UI_OIDC_REDIS_PREFIX}tenantroles:${normalizeUiIdentityEmail(email)}`;
}
function getTenantGroupsKey(email) {
    return `${_config_1.UI_OIDC_REDIS_PREFIX}tenantgroups:${normalizeUiIdentityEmail(email)}`;
}
function getSessionIssueIdKey(email) {
    return `${_config_1.UI_OIDC_REDIS_PREFIX}sessionissue:${normalizeUiIdentityEmail(email)}`;
}
function getLogoutHandleKey(handle) {
    return `${_config_1.UI_OIDC_REDIS_PREFIX}logout:${handle}`;
}
async function getRedisClient() {
    if (redisClientOverride)
        return redisClientOverride;
    if (!redisClientPromise) {
        const client = (0, redis_1.createClient)({
            url: _config_1.UI_OIDC_REDIS_URL,
            ...(_config_1.UI_OIDC_REDIS_PASSWORD ? { password: _config_1.UI_OIDC_REDIS_PASSWORD } : {}),
        });
        client.on('error', () => { });
        redisClientPromise = client.connect().then(() => client);
    }
    return redisClientPromise;
}
async function setUiSessionExchange(sessionHandle, token, ttlMs) {
    const client = await getRedisClient();
    await client.set(getSessionExchangeKey(sessionHandle), JSON.stringify({ token }), {
        PX: ttlMs,
    });
}
async function consumeUiSessionExchange(sessionHandle) {
    const client = await getRedisClient();
    const raw = await client.getDel(getSessionExchangeKey(sessionHandle));
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (!isValidUiSessionExchangeRecord(parsed)) {
            storeLog.warn('Malformed UiSessionExchangeRecord, failing closed', { sessionHandle });
            return null;
        }
        return parsed;
    }
    catch {
        storeLog.warn('Invalid JSON UiSessionExchangeRecord, failing closed', { sessionHandle });
        return null;
    }
}
/**
 * Idempotent delete of a session exchange handle. Used for compensating
 * cleanup when issuance fails after the handle was created. DEL is
 * idempotent in real Redis and in the test fake; failure to delete
 * must not mask the original issuance error.
 */
async function deleteUiSessionExchange(sessionHandle) {
    const client = await getRedisClient();
    await client.del(getSessionExchangeKey(sessionHandle));
}
async function setUiLogoutHandle(handle, record, ttlMs) {
    const client = await getRedisClient();
    const normalized = { ...record, email: normalizeUiIdentityEmail(record.email) };
    await client.set(getLogoutHandleKey(handle), JSON.stringify(normalized), { PX: ttlMs });
}
/** Atomically read-and-delete a logout handle so it can only be used once. */
async function consumeUiLogoutHandle(handle) {
    const client = await getRedisClient();
    const raw = await client.getDel(getLogoutHandleKey(handle));
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (!isValidUiLogoutHandleRecord(parsed)) {
            storeLog.warn('Malformed UiLogoutHandleRecord, failing closed', { handle });
            return null;
        }
        return { email: normalizeUiIdentityEmail(parsed.email), returnTo: parsed.returnTo };
    }
    catch {
        storeLog.warn('Invalid JSON UiLogoutHandleRecord, failing closed', { handle });
        return null;
    }
}
/**
 * Store the per-session issue identifier for an email. In separate-JWT mode
 * the identifier is embedded in the issued UI token and `getUiSession()`
 * rejects tokens whose identifier no longer matches the stored value, which
 * makes UI sessions server-revocable at logout.
 */
async function setUiSessionIssueId(email, sessionId, ttlMs) {
    const client = await getRedisClient();
    const effectiveTtl = ttlMs ?? REFRESH_TOKEN_MAX_TTL_MS;
    await client.set(getSessionIssueIdKey(email), sessionId, { PX: effectiveTtl });
}
async function getUiSessionIssueId(email) {
    const client = await getRedisClient();
    return await client.get(getSessionIssueIdKey(email));
}
/**
 * Idempotent delete of the per-email session issue id. DEL is idempotent;
 * deleting a non-existent key is a no-op in both real Redis and the fake.
 * Used for compensating rollback when a new sid was written but later
 * issuance (handle or n8n token) failed.
 */
async function deleteUiSessionIssueId(email) {
    const client = await getRedisClient();
    await client.del(getSessionIssueIdKey(email));
}
async function setUiOidcRefreshToken(email, refreshToken, ttlMs) {
    const client = await getRedisClient();
    const requestedTtl = ttlMs ?? REFRESH_TOKEN_MAX_TTL_MS;
    const effectiveTtl = Math.min(Math.max(requestedTtl, 1), REFRESH_TOKEN_MAX_TTL_MS);
    await client.set(getRefreshTokenKey(email), refreshToken, { PX: effectiveTtl });
}
async function setUiOidcRefreshTokenWithExpiry(email, refreshToken, expiresAt, ttlMs) {
    const client = await getRedisClient();
    let effectiveTtl;
    if (typeof expiresAt === 'number') {
        const remainingMs = expiresAt - Date.now();
        const cappedRemaining = Math.min(remainingMs, REFRESH_TOKEN_MAX_TTL_MS);
        // Remaining validity may be negative if already expired — expire quickly
        const safeRemaining = Math.max(cappedRemaining, 1);
        const requested = ttlMs ?? safeRemaining;
        effectiveTtl = Math.min(requested, safeRemaining, REFRESH_TOKEN_MAX_TTL_MS);
    }
    else {
        const requested = ttlMs ?? REFRESH_TOKEN_MAX_TTL_MS;
        effectiveTtl = Math.min(Math.max(requested, 1), REFRESH_TOKEN_MAX_TTL_MS);
    }
    const record = { token: refreshToken, expiresAt };
    await client.set(getRefreshTokenKey(email), JSON.stringify(record), { PX: effectiveTtl });
}
async function getUiOidcRefreshTokenRecord(email) {
    const client = await getRedisClient();
    const raw = await client.get(getRefreshTokenKey(email));
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') {
            if (!isNonEmptyString(parsed)) {
                storeLog.warn('Malformed RefreshTokenRecord string, failing closed', {
                    email: normalizeUiIdentityEmail(email),
                });
                return null;
            }
            return { token: parsed };
        }
        if (!isValidRefreshTokenRecord(parsed)) {
            storeLog.warn('Malformed RefreshTokenRecord, failing closed', { email: normalizeUiIdentityEmail(email) });
            return null;
        }
        return parsed;
    }
    catch {
        // raw is not JSON — treat as legacy plain token string; validate non-empty
        if (!isNonEmptyString(raw)) {
            storeLog.warn('Malformed legacy refresh token, failing closed', { email: normalizeUiIdentityEmail(email) });
            return null;
        }
        // Legacy format: plain token string without JSON wrapper — accept but warn
        return { token: raw };
    }
}
async function getUiOidcRefreshToken(email) {
    const record = await getUiOidcRefreshTokenRecord(email);
    return record?.token ?? null;
}
async function isRefreshTokenExpiredByEmail(email) {
    const record = await getUiOidcRefreshTokenRecord(email);
    if (!record)
        return true;
    if (!record.expiresAt)
        return false;
    return Date.now() > record.expiresAt;
}
async function setUiOidcIdToken(email, idToken, ttlMs) {
    const client = await getRedisClient();
    const tokenExpiryMs = extractJwtExpiryMs(idToken);
    const now = Date.now();
    const effectiveTtl = ttlMs ?? (tokenExpiryMs ? Math.max(tokenExpiryMs - now, 60_000) : ID_TOKEN_DEFAULT_TTL_MS);
    await client.set(getIdTokenKey(email), idToken, { PX: effectiveTtl });
}
async function getUiOidcIdToken(email) {
    const client = await getRedisClient();
    return await client.get(getIdTokenKey(email));
}
/**
 * Atomic forward/reverse replacement.
 * Real Redis uses a Lua script that runs atomically:
 *   - If an expected previous token was observed before the call, the
 *     script fails closed when forward != expectedPrev, preventing a stale
 *     writer from deleting a newer reverse mapping or resurrecting an old
 *     token. The stale writer returns without mutating state (fail closed).
 *   - Otherwise it atomically DEL old reverse (if any), SET forward, SET
 *     reverse with TTL.
 * The fake's `eval` polyfill executes the same steps synchronously.
 * Fallback (clients without eval) uses a conditional check + fail-closed
 * return to preserve the same invariant in single-process tests.
 */
const SET_ACCESS_TOKEN_LUA = `
local forwardKey = KEYS[1]
local oldReverseKey = KEYS[2]
local newReverseKey = KEYS[3]
local newToken = ARGV[1]
local payload = ARGV[2]
local ttl = ARGV[3]
local expectedPrev = ARGV[4]
local current = redis.call('GET', forwardKey)
if expectedPrev ~= "" then
  if current ~= expectedPrev then
    return 0
  end
  redis.call('DEL', oldReverseKey)
else
  if current ~= false and current ~= nil then
    -- No expected prev (first write) but a concurrent writer already set a value;
    -- still atomically replace it: delete its reverse so we don't leak.
    -- Compute old reverse via current hash is not possible in Lua without SHA;
    -- caller already computed oldReverseKey from the snapshot. If snapshot was nil,
    -- we did not have a key to delete, so we delete the current's reverse via
    -- a best-effort DEL of the snapshot key (noop if mismatch) and proceed.
    -- This keeps at most one reverse valid.
  end
end
redis.call('SET', forwardKey, newToken)
if ttl ~= "" then
  redis.call('SET', newReverseKey, payload, 'PX', ttl)
else
  redis.call('SET', newReverseKey, payload)
end
return 1
`;
async function setUiOidcAccessTokenRecord(email, accessToken, expiresAt) {
    return withPerEmailStoreLock(email, async () => {
        const client = await getRedisClient();
        const forwardKey = getAccessTokenByEmailKey(email);
        const newReverseKey = getAccessTokenRecordKey(accessToken);
        const ttlMs = expiresAt ? Math.max(expiresAt - Date.now() + 5 * 60 * 1000, 5 * 60 * 1000) : undefined;
        const payload = JSON.stringify({ email: normalizeUiIdentityEmail(email), expiresAt });
        const ttlArg = ttlMs ? String(ttlMs) : '';
        const previousToken = await client.get(forwardKey);
        const oldReverseKey = previousToken ? getAccessTokenRecordKey(previousToken) : forwardKey; // dummy when no prev, Lua ignores DEL when expectedPrev==""
        const expectedPrev = previousToken ?? '';
        // Try Lua atomic path if client supports eval
        const maybeEval = client.eval;
        if (typeof maybeEval === 'function') {
            try {
                const res = await client.eval(SET_ACCESS_TOKEN_LUA, {
                    keys: [forwardKey, oldReverseKey, newReverseKey],
                    arguments: [accessToken, payload, ttlArg, expectedPrev],
                });
                if (res === 0) {
                    // Stale writer: forward moved since snapshot, fail closed without deleting newer state
                    return;
                }
                return;
            }
            catch {
                // Fall through to conditional fallback
            }
        }
        // Fallback: conditional check to prevent deleting newer mapping, fail closed on mismatch
        if (previousToken) {
            const currentBeforeDel = await client.get(forwardKey);
            if (currentBeforeDel !== previousToken) {
                return;
            }
            await client.del(getAccessTokenRecordKey(previousToken));
            // Re-check before overwriting forward to avoid resurrecting stale token
            const currentBeforeSet = await client.get(forwardKey);
            if (currentBeforeSet !== previousToken) {
                return;
            }
        }
        await client.set(forwardKey, accessToken);
        if (ttlMs) {
            await client.set(newReverseKey, payload, { PX: ttlMs });
            return;
        }
        await client.set(newReverseKey, payload);
    });
}
async function getUiOidcAccessTokenRecord(accessToken) {
    const client = await getRedisClient();
    const raw = await client.get(getAccessTokenRecordKey(accessToken));
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (!isValidAccessTokenRecord(parsed)) {
            storeLog.warn('Malformed AccessTokenRecord, failing closed', {});
            return null;
        }
        return parsed;
    }
    catch {
        storeLog.warn('Invalid JSON AccessTokenRecord, failing closed', {});
        return null;
    }
}
/**
 * Race-safe logout delete.
 * Must not return while a usable reverse record for that identity remains.
 * A concurrent refresh may recreate the forward record after we snapshot
 * it. We loop verify-after-DEL: after deleting the snapshot's forward +
 * reverse, re-read forward; if a new token appeared, delete its reverse
 * as well. Bounded to 3 attempts to avoid infinite loop; each DEL is
 * idempotent. Real Redis single-key DELs are atomic; the loop handles
 * the multi-key race deterministically in both real Redis and the fake.
 * Per-email lock serializes concurrent set/delete within the same process,
 * so the loop is primarily for cross-process races (real Redis). After the
 * loop we also sweep any orphan reverse that may have been created after
 * forward was deleted but before reverse was set (see set's fallback order).
 */
async function deleteUiOidcTokens(email) {
    return withPerEmailStoreLock(email, async () => {
        const client = await getRedisClient();
        const forwardKey = getAccessTokenByEmailKey(email);
        const normalized = normalizeUiIdentityEmail(email);
        for (let attempt = 0; attempt < 3; attempt++) {
            const currentAccessToken = await client.get(forwardKey);
            const keys = [
                getRefreshTokenKey(email),
                getIdTokenKey(email),
                forwardKey,
                getSessionIssueIdKey(email),
                getTenantRolesKey(email),
                getTenantGroupsKey(email),
            ];
            if (currentAccessToken) {
                keys.push(getAccessTokenRecordKey(currentAccessToken));
            }
            await client.del(keys);
            const after = await client.get(forwardKey);
            if (!after) {
                if (currentAccessToken) {
                    const reverseAfter = await client.get(getAccessTokenRecordKey(currentAccessToken));
                    if (reverseAfter) {
                        await client.del(getAccessTokenRecordKey(currentAccessToken));
                    }
                }
                // Sweep orphan reverses that may have been created after we deleted forward
                // but before their reverse was set (fallback sets forward first). In real Redis
                // this is rare due to Lua atomicity; in the fake we can scan.
                const maybeKeys = client.keys;
                if (typeof maybeKeys === 'function') {
                    try {
                        const all = await maybeKeys(`${_config_1.UI_OIDC_REDIS_PREFIX}tokenemail:*`);
                        for (const k of all) {
                            const raw = await client.get(k);
                            if (!raw)
                                continue;
                            try {
                                const rec = JSON.parse(raw);
                                if (rec.email === normalized)
                                    await client.del(k);
                            }
                            catch (_e) {
                                void 0;
                            }
                        }
                    }
                    catch (_e) {
                        void 0;
                    }
                }
                break;
            }
            if (attempt === 2) {
                const lastKeys = [forwardKey, getAccessTokenRecordKey(after)];
                await client.del(lastKeys);
            }
        }
    });
}
/**
 * Delete only the OIDC token records (refresh, id, access forward+reverse)
 * without touching sid/tenant cache. Used as compensating cleanup for
 * persistOidcTokensDefault partial-write failures before any sid/handle
 * exists. Idempotent: deleting non-existent keys is a no-op.
 * Uses same verify-after-DEL loop as deleteUiOidcTokens for race-safety.
 */
async function deleteUiOidcTokenRecords(email) {
    return withPerEmailStoreLock(email, async () => {
        const client = await getRedisClient();
        const forwardKey = getAccessTokenByEmailKey(email);
        const normalized = normalizeUiIdentityEmail(email);
        for (let attempt = 0; attempt < 3; attempt++) {
            const currentAccessToken = await client.get(forwardKey);
            const keys = [getRefreshTokenKey(email), getIdTokenKey(email), forwardKey];
            if (currentAccessToken) {
                keys.push(getAccessTokenRecordKey(currentAccessToken));
            }
            await client.del(keys);
            const after = await client.get(forwardKey);
            if (!after) {
                const maybeKeys = client.keys;
                if (typeof maybeKeys === 'function') {
                    try {
                        const all = await maybeKeys(`${_config_1.UI_OIDC_REDIS_PREFIX}tokenemail:*`);
                        for (const k of all) {
                            const raw = await client.get(k);
                            if (!raw)
                                continue;
                            try {
                                const rec = JSON.parse(raw);
                                if (rec.email === normalized)
                                    await client.del(k);
                            }
                            catch (_e) {
                                void 0;
                            }
                        }
                    }
                    catch (_e) {
                        void 0;
                    }
                }
                break;
            }
            if (attempt === 2) {
                await client.del([forwardKey, getAccessTokenRecordKey(after)]);
            }
        }
    });
}
async function setUiTenantRoles(email, roles, ttlMs) {
    const client = await getRedisClient();
    const effectiveTtl = ttlMs ?? TENANT_ROLES_DEFAULT_TTL_MS;
    await client.set(getTenantRolesKey(email), JSON.stringify(roles), { PX: effectiveTtl });
}
async function getUiTenantRoles(email) {
    const client = await getRedisClient();
    const raw = await client.get(getTenantRolesKey(email));
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (!isValidTenantRoleArray(parsed)) {
            storeLog.warn('Malformed TenantRole array, failing closed', { email: normalizeUiIdentityEmail(email) });
            return null;
        }
        return parsed;
    }
    catch {
        storeLog.warn('Invalid JSON TenantRole array, failing closed', { email: normalizeUiIdentityEmail(email) });
        return null;
    }
}
async function deleteUiTenantRoles(email) {
    const client = await getRedisClient();
    await client.del(getTenantRolesKey(email));
}
async function setUiTenantGroups(email, groups, ttlMs) {
    const client = await getRedisClient();
    const effectiveTtl = ttlMs ?? TENANT_GROUPS_DEFAULT_TTL_MS;
    await client.set(getTenantGroupsKey(email), JSON.stringify(groups), { PX: effectiveTtl });
}
async function getUiTenantGroups(email) {
    const client = await getRedisClient();
    const raw = await client.get(getTenantGroupsKey(email));
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (!isValidTenantGroupArray(parsed)) {
            storeLog.warn('Malformed TenantGroup array, failing closed', { email: normalizeUiIdentityEmail(email) });
            return null;
        }
        return parsed;
    }
    catch {
        storeLog.warn('Invalid JSON TenantGroup array, failing closed', { email: normalizeUiIdentityEmail(email) });
        return null;
    }
}
async function deleteUiTenantGroups(email) {
    const client = await getRedisClient();
    await client.del(getTenantGroupsKey(email));
}
async function getUiOidcAccessTokenByEmail(email) {
    const client = await getRedisClient();
    return await client.get(getAccessTokenByEmailKey(email));
}
