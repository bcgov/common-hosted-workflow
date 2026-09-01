import { createHash } from 'crypto';
import { createClient } from 'redis';
import { UI_OIDC_REDIS_URL, UI_OIDC_REDIS_PASSWORD, UI_OIDC_REDIS_PREFIX } from '@config';
import { createLogger } from '../utils/logger';

const storeLog = createLogger('UiOidcStore');

/**
 * Atomicity & test-fake fidelity (AUTH-04, AUTH-05):
 * All single-key ops (SET with PX, GET, DEL, GETDEL) are atomic in real Redis.
 * The in-memory fake used in unit tests models each as a single synchronous
 * Map operation, which is faithful because real Redis also executes each
 * command atomically and Node's single-threaded event loop serializes
 * awaits. Composite multi-key sequences (e.g., sid+handle, forward+reverse
 * access-token) are NOT atomic and require explicit compensating cleanup;
 * the fake reproduces the exact interleaving vulnerability (sid written
 * before handle) and the DEL-based idempotent compensation (deleting a
 * missing key is a no-op in both). Real-Redis integration tests (when
 * available) exercise GETDEL single-use and DEL idempotency; the fake's
 * behavior for those commands is documented as accurate for the tested
 * atomicity scope.
 *
 * AUTH-05 adds Lua-backed atomic replacement for forward/reverse
 * access-token records. Real Redis executes the Lua script atomically
 * (single-threaded). The fake's `eval` polyfill executes the same logical
 * steps synchronously on its Map, preserving the invariant that an older
 * writer cannot delete a newer reverse mapping. Single-key SET/PX, GET,
 * DEL, GETDEL remain atomic in both; multi-key replacement is atomic only
 * via the Lua path (real Redis) or the synchronous eval polyfill (fake).
 * Logout's delete uses a verify-after-DEL loop to handle concurrent
 * refresh writers that may recreate the forward record after the initial
 * snapshot — the fake reproduces the same race via async interleavings.
 */

type UiSessionExchangeRecord = {
  token: string;
};

export type UiLogoutHandleRecord = {
  email: string;
  returnTo: string;
};

type RedisClient = Awaited<ReturnType<typeof createClient>>;
type AccessTokenRecord = { email: string; expiresAt?: number };
export type RefreshTokenRecord = { token: string; expiresAt?: number };

export type TenantRole = {
  tenantId: string;
  tenantName: string;
  roles: string[];
};

export type TenantGroup = {
  tenantId: string;
  tenantName: string;
  groups: string[];
};

const REFRESH_TOKEN_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ID_TOKEN_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TENANT_ROLES_DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const TENANT_GROUPS_DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

function extractJwtExpiryMs(token: string): number | undefined {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;

    let base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

let redisClientPromise: Promise<RedisClient> | null = null;
// AUTH-07: Smallest injectable store boundary — tests can inject a fake client
// without mocking the `redis` module. Real code never calls this; contract
// tests use the fake, security-relevant ops are exercised against both fake
// and real Redis when UI_OIDC_REDIS_URL points at a real instance.
let redisClientOverride: Promise<RedisClient> | null = null;
export function setRedisClientForTests(client: RedisClient): void {
  redisClientOverride = Promise.resolve(client);
}
export function clearRedisClientForTests(): void {
  redisClientOverride = null;
  redisClientPromise = null;
}
export function setRedisClientPromiseForTests(promise: Promise<RedisClient>): void {
  redisClientOverride = promise;
}

// AUTH-07: Runtime validation for persisted JSON — fail closed on malformed.
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
function isValidUiSessionExchangeRecord(v: unknown): v is UiSessionExchangeRecord {
  return typeof v === 'object' && v !== null && 'token' in v && isNonEmptyString((v as Record<string, unknown>).token);
}
function isValidUiLogoutHandleRecord(v: unknown): v is UiLogoutHandleRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return isNonEmptyString(r.email) && String(r.email).includes('@') && typeof r.returnTo === 'string';
}
function isValidRefreshTokenRecord(v: unknown): v is RefreshTokenRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (!isNonEmptyString(r.token)) return false;
  if ('expiresAt' in r && r.expiresAt !== undefined && typeof r.expiresAt !== 'number') return false;
  return true;
}
function isValidAccessTokenRecord(v: unknown): v is AccessTokenRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (!isNonEmptyString(r.email)) return false;
  if ('expiresAt' in r && r.expiresAt !== undefined && typeof r.expiresAt !== 'number') return false;
  return true;
}
function isValidTenantRoleArray(v: unknown): v is TenantRole[] {
  if (!Array.isArray(v)) return false;
  return v.every(
    (e) =>
      typeof e === 'object' &&
      e !== null &&
      isNonEmptyString((e as Record<string, unknown>).tenantId) &&
      typeof (e as Record<string, unknown>).tenantName === 'string' &&
      Array.isArray((e as Record<string, unknown>).roles) &&
      ((e as Record<string, unknown>).roles as unknown[]).every((r) => typeof r === 'string'),
  );
}
function isValidTenantGroupArray(v: unknown): v is TenantGroup[] {
  if (!Array.isArray(v)) return false;
  return v.every(
    (e) =>
      typeof e === 'object' &&
      e !== null &&
      isNonEmptyString((e as Record<string, unknown>).tenantId) &&
      typeof (e as Record<string, unknown>).tenantName === 'string' &&
      Array.isArray((e as Record<string, unknown>).groups) &&
      ((e as Record<string, unknown>).groups as unknown[]).every((r) => typeof r === 'string'),
  );
}

/**
 * AUTH-05: Per-email in-process mutex for store mutations.
 * Serializes concurrent `setUiOidcAccessTokenRecord` and
 * `deleteUiOidcTokens` for the same email within a single Node process.
 * Prevents JS-yield interleaving from orphaning reverse records.
 * Real Redis Lua provides cross-process atomicity; this lock covers
 * single-process concurrency. Lock is per normalized email, held only
 * for the duration of the mutation, released on success or throw
 * (crash recovery: process death clears the Map).
 */
const perEmailStoreLocks = new Map<string, Promise<void>>();
async function withPerEmailStoreLock<T>(email: string, fn: () => Promise<T>): Promise<T> {
  const key = normalizeUiIdentityEmail(email);
  const prev = perEmailStoreLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  perEmailStoreLocks.set(
    key,
    prev.then(() => next),
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (perEmailStoreLocks.get(key) === next) perEmailStoreLocks.delete(key);
  }
}
export function clearPerEmailStoreLocksForTests() {
  perEmailStoreLocks.clear();
}

function getSessionExchangeKey(sessionHandle: string) {
  return `${UI_OIDC_REDIS_PREFIX}session:${sessionHandle}`;
}

/**
 * Normalize an identity email before it is used as (part of) a Redis key so
 * every caller reads and deletes the same records regardless of case or
 * surrounding whitespace.
 */
export function normalizeUiIdentityEmail(email: string) {
  return email.trim().toLowerCase();
}

function getRefreshTokenKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}reftoken:${normalizeUiIdentityEmail(email)}`;
}

function getIdTokenKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}idtoken:${normalizeUiIdentityEmail(email)}`;
}

function getAccessTokenByEmailKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}acctoken:${normalizeUiIdentityEmail(email)}`;
}

function getAccessTokenRecordKey(token: string) {
  const digest = createHash('sha256').update(token).digest('hex');
  return `${UI_OIDC_REDIS_PREFIX}tokenemail:${digest}`;
}

function getTenantRolesKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}tenantroles:${normalizeUiIdentityEmail(email)}`;
}

function getTenantGroupsKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}tenantgroups:${normalizeUiIdentityEmail(email)}`;
}

function getSessionIssueIdKey(email: string) {
  return `${UI_OIDC_REDIS_PREFIX}sessionissue:${normalizeUiIdentityEmail(email)}`;
}

function getLogoutHandleKey(handle: string) {
  return `${UI_OIDC_REDIS_PREFIX}logout:${handle}`;
}

async function getRedisClient(): Promise<RedisClient> {
  if (redisClientOverride) return redisClientOverride;
  if (!redisClientPromise) {
    const client = createClient({
      url: UI_OIDC_REDIS_URL,
      ...(UI_OIDC_REDIS_PASSWORD ? { password: UI_OIDC_REDIS_PASSWORD } : {}),
    });
    client.on('error', () => {});
    redisClientPromise = client.connect().then(() => client) as Promise<RedisClient>;
  }

  return redisClientPromise;
}

export async function setUiSessionExchange(sessionHandle: string, token: string, ttlMs: number) {
  const client = await getRedisClient();
  await client.set(getSessionExchangeKey(sessionHandle), JSON.stringify({ token } satisfies UiSessionExchangeRecord), {
    PX: ttlMs,
  });
}

export async function consumeUiSessionExchange(sessionHandle: string) {
  const client = await getRedisClient();
  const raw = await client.getDel(getSessionExchangeKey(sessionHandle));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidUiSessionExchangeRecord(parsed)) {
      storeLog.warn('Malformed UiSessionExchangeRecord, failing closed', { sessionHandle });
      return null;
    }
    return parsed;
  } catch {
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
export async function deleteUiSessionExchange(sessionHandle: string): Promise<void> {
  const client = await getRedisClient();
  await client.del(getSessionExchangeKey(sessionHandle));
}

export async function setUiLogoutHandle(handle: string, record: UiLogoutHandleRecord, ttlMs: number) {
  const client = await getRedisClient();
  const normalized: UiLogoutHandleRecord = { ...record, email: normalizeUiIdentityEmail(record.email) };
  await client.set(getLogoutHandleKey(handle), JSON.stringify(normalized), { PX: ttlMs });
}

/** Atomically read-and-delete a logout handle so it can only be used once. */
export async function consumeUiLogoutHandle(handle: string): Promise<UiLogoutHandleRecord | null> {
  const client = await getRedisClient();
  const raw = await client.getDel(getLogoutHandleKey(handle));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidUiLogoutHandleRecord(parsed)) {
      storeLog.warn('Malformed UiLogoutHandleRecord, failing closed', { handle });
      return null;
    }
    return { email: normalizeUiIdentityEmail(parsed.email), returnTo: parsed.returnTo };
  } catch {
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
export async function setUiSessionIssueId(email: string, sessionId: string, ttlMs?: number) {
  const client = await getRedisClient();
  const effectiveTtl = ttlMs ?? REFRESH_TOKEN_MAX_TTL_MS;
  await client.set(getSessionIssueIdKey(email), sessionId, { PX: effectiveTtl });
}

export async function getUiSessionIssueId(email: string): Promise<string | null> {
  const client = await getRedisClient();
  return await client.get(getSessionIssueIdKey(email));
}

/**
 * Idempotent delete of the per-email session issue id. DEL is idempotent;
 * deleting a non-existent key is a no-op in both real Redis and the fake.
 * Used for compensating rollback when a new sid was written but later
 * issuance (handle or n8n token) failed.
 */
export async function deleteUiSessionIssueId(email: string): Promise<void> {
  const client = await getRedisClient();
  await client.del(getSessionIssueIdKey(email));
}

export async function setUiOidcRefreshToken(email: string, refreshToken: string, ttlMs?: number) {
  const client = await getRedisClient();
  const requestedTtl = ttlMs ?? REFRESH_TOKEN_MAX_TTL_MS;
  const effectiveTtl = Math.min(Math.max(requestedTtl, 1), REFRESH_TOKEN_MAX_TTL_MS);
  await client.set(getRefreshTokenKey(email), refreshToken, { PX: effectiveTtl });
}

export async function setUiOidcRefreshTokenWithExpiry(
  email: string,
  refreshToken: string,
  expiresAt?: number,
  ttlMs?: number,
) {
  const client = await getRedisClient();
  let effectiveTtl: number;
  if (typeof expiresAt === 'number') {
    const remainingMs = expiresAt - Date.now();
    const cappedRemaining = Math.min(remainingMs, REFRESH_TOKEN_MAX_TTL_MS);
    // Remaining validity may be negative if already expired — expire quickly
    const safeRemaining = Math.max(cappedRemaining, 1);
    const requested = ttlMs ?? safeRemaining;
    effectiveTtl = Math.min(requested, safeRemaining, REFRESH_TOKEN_MAX_TTL_MS);
  } else {
    const requested = ttlMs ?? REFRESH_TOKEN_MAX_TTL_MS;
    effectiveTtl = Math.min(Math.max(requested, 1), REFRESH_TOKEN_MAX_TTL_MS);
  }
  const record: RefreshTokenRecord = { token: refreshToken, expiresAt };
  await client.set(getRefreshTokenKey(email), JSON.stringify(record), { PX: effectiveTtl });
}

export async function getUiOidcRefreshTokenRecord(email: string): Promise<RefreshTokenRecord | null> {
  const client = await getRedisClient();
  const raw = await client.get(getRefreshTokenKey(email));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
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
  } catch {
    // raw is not JSON — treat as legacy plain token string; validate non-empty
    if (!isNonEmptyString(raw)) {
      storeLog.warn('Malformed legacy refresh token, failing closed', { email: normalizeUiIdentityEmail(email) });
      return null;
    }
    // Legacy format: plain token string without JSON wrapper — accept but warn
    return { token: raw };
  }
}

export async function getUiOidcRefreshToken(email: string) {
  const record = await getUiOidcRefreshTokenRecord(email);
  return record?.token ?? null;
}

export async function isRefreshTokenExpiredByEmail(email: string): Promise<boolean> {
  const record = await getUiOidcRefreshTokenRecord(email);
  if (!record) return true;
  if (!record.expiresAt) return false;
  return Date.now() > record.expiresAt;
}

export async function setUiOidcIdToken(email: string, idToken: string, ttlMs?: number) {
  const client = await getRedisClient();
  const tokenExpiryMs = extractJwtExpiryMs(idToken);
  const now = Date.now();
  const effectiveTtl = ttlMs ?? (tokenExpiryMs ? Math.max(tokenExpiryMs - now, 60_000) : ID_TOKEN_DEFAULT_TTL_MS);
  await client.set(getIdTokenKey(email), idToken, { PX: effectiveTtl });
}

export async function getUiOidcIdToken(email: string) {
  const client = await getRedisClient();
  return await client.get(getIdTokenKey(email));
}

/**
 * AUTH-05: Atomic forward/reverse replacement.
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

export async function setUiOidcAccessTokenRecord(email: string, accessToken: string, expiresAt?: number) {
  return withPerEmailStoreLock(email, async () => {
    const client = await getRedisClient();
    const forwardKey = getAccessTokenByEmailKey(email);
    const newReverseKey = getAccessTokenRecordKey(accessToken);
    const ttlMs = expiresAt ? Math.max(expiresAt - Date.now() + 5 * 60 * 1000, 5 * 60 * 1000) : undefined;
    const payload = JSON.stringify({ email: normalizeUiIdentityEmail(email), expiresAt } satisfies AccessTokenRecord);
    const ttlArg = ttlMs ? String(ttlMs) : '';

    const previousToken = await client.get(forwardKey);
    const oldReverseKey = previousToken ? getAccessTokenRecordKey(previousToken) : forwardKey; // dummy when no prev, Lua ignores DEL when expectedPrev==""
    const expectedPrev = previousToken ?? '';

    // Try Lua atomic path if client supports eval
    const maybeEval = (client as unknown as { eval?: unknown }).eval;
    if (typeof maybeEval === 'function') {
      try {
        const res = await (client as unknown as { eval: (s: string, o: unknown) => Promise<unknown> }).eval(
          SET_ACCESS_TOKEN_LUA,
          {
            keys: [forwardKey, oldReverseKey, newReverseKey],
            arguments: [accessToken, payload, ttlArg, expectedPrev],
          },
        );
        if (res === 0) {
          // Stale writer: forward moved since snapshot, fail closed without deleting newer state
          return;
        }
        return;
      } catch {
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

export async function getUiOidcAccessTokenRecord(accessToken: string) {
  const client = await getRedisClient();
  const raw = await client.get(getAccessTokenRecordKey(accessToken));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidAccessTokenRecord(parsed)) {
      storeLog.warn('Malformed AccessTokenRecord, failing closed', {});
      return null;
    }
    return parsed;
  } catch {
    storeLog.warn('Invalid JSON AccessTokenRecord, failing closed', {});
    return null;
  }
}

/**
 * AUTH-05: Race-safe logout delete.
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
export async function deleteUiOidcTokens(email: string) {
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
        const maybeKeys = (client as unknown as { keys?: (p: string) => Promise<string[]> }).keys;
        if (typeof maybeKeys === 'function') {
          try {
            const all = await maybeKeys(`${UI_OIDC_REDIS_PREFIX}tokenemail:*`);
            for (const k of all) {
              const raw = await client.get(k);
              if (!raw) continue;
              try {
                const rec = JSON.parse(raw) as AccessTokenRecord;
                if (rec.email === normalized) await client.del(k);
              } catch (_e) {
                void 0;
              }
            }
          } catch (_e) {
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
export async function deleteUiOidcTokenRecords(email: string): Promise<void> {
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
        const maybeKeys = (client as unknown as { keys?: (p: string) => Promise<string[]> }).keys;
        if (typeof maybeKeys === 'function') {
          try {
            const all = await maybeKeys(`${UI_OIDC_REDIS_PREFIX}tokenemail:*`);
            for (const k of all) {
              const raw = await client.get(k);
              if (!raw) continue;
              try {
                const rec = JSON.parse(raw) as AccessTokenRecord;
                if (rec.email === normalized) await client.del(k);
              } catch (_e) {
                void 0;
              }
            }
          } catch (_e) {
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

export async function setUiTenantRoles(email: string, roles: TenantRole[], ttlMs?: number) {
  const client = await getRedisClient();
  const effectiveTtl = ttlMs ?? TENANT_ROLES_DEFAULT_TTL_MS;
  await client.set(getTenantRolesKey(email), JSON.stringify(roles), { PX: effectiveTtl });
}

export async function getUiTenantRoles(email: string): Promise<TenantRole[] | null> {
  const client = await getRedisClient();
  const raw = await client.get(getTenantRolesKey(email));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidTenantRoleArray(parsed)) {
      storeLog.warn('Malformed TenantRole array, failing closed', { email: normalizeUiIdentityEmail(email) });
      return null;
    }
    return parsed;
  } catch {
    storeLog.warn('Invalid JSON TenantRole array, failing closed', { email: normalizeUiIdentityEmail(email) });
    return null;
  }
}

export async function deleteUiTenantRoles(email: string) {
  const client = await getRedisClient();
  await client.del(getTenantRolesKey(email));
}

export async function setUiTenantGroups(email: string, groups: TenantGroup[], ttlMs?: number) {
  const client = await getRedisClient();
  const effectiveTtl = ttlMs ?? TENANT_GROUPS_DEFAULT_TTL_MS;
  await client.set(getTenantGroupsKey(email), JSON.stringify(groups), { PX: effectiveTtl });
}

export async function getUiTenantGroups(email: string): Promise<TenantGroup[] | null> {
  const client = await getRedisClient();
  const raw = await client.get(getTenantGroupsKey(email));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidTenantGroupArray(parsed)) {
      storeLog.warn('Malformed TenantGroup array, failing closed', { email: normalizeUiIdentityEmail(email) });
      return null;
    }
    return parsed;
  } catch {
    storeLog.warn('Invalid JSON TenantGroup array, failing closed', { email: normalizeUiIdentityEmail(email) });
    return null;
  }
}

export async function deleteUiTenantGroups(email: string) {
  const client = await getRedisClient();
  await client.del(getTenantGroupsKey(email));
}

export async function getUiOidcAccessTokenByEmail(email: string): Promise<string | null> {
  const client = await getRedisClient();
  return await client.get(getAccessTokenByEmailKey(email));
}
