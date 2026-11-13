'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.REFRESH_SINGLE_FLIGHT_TIMEOUT_MS = void 0;
exports.setUiSessionStoreForTests = setUiSessionStoreForTests;
exports.clearRefreshSingleFlightForTests = clearRefreshSingleFlightForTests;
exports.getRefreshSingleFlightSizeForTests = getRefreshSingleFlightSizeForTests;
exports.getBearerToken = getBearerToken;
exports.serializeN8nUser = serializeN8nUser;
exports.getUiSession = getUiSession;
exports.refreshSessionByEmail = refreshSessionByEmail;
const crypto_1 = require('crypto');
const jose_1 = require('jose');
const _config_1 = require('@config');
const oidc_provider_1 = require('./oidc-provider');
const ui_oidc_store_1 = require('./ui-oidc-store');
const defaultSessionStoreDeps = {
  getUiOidcAccessTokenRecord: ui_oidc_store_1.getUiOidcAccessTokenRecord,
  getUiOidcRefreshTokenRecord: ui_oidc_store_1.getUiOidcRefreshTokenRecord,
  getUiSessionIssueId: ui_oidc_store_1.getUiSessionIssueId,
  setUiOidcAccessTokenRecord: ui_oidc_store_1.setUiOidcAccessTokenRecord,
  setUiOidcIdToken: ui_oidc_store_1.setUiOidcIdToken,
  setUiOidcRefreshTokenWithExpiry: ui_oidc_store_1.setUiOidcRefreshTokenWithExpiry,
};
let sessionStoreOverride = null;
function setUiSessionStoreForTests(deps) {
  sessionStoreOverride = deps;
}
function resolveSessionStore(deps) {
  const base = sessionStoreOverride ?? {};
  const merged = { ...defaultSessionStoreDeps, ...base, ...deps };
  return merged;
}
const ui_auth_token_1 = require('./ui-auth-token');
const n8n_oidc_1 = require('./n8n-oidc');
const tenant_roles_1 = require('./tenant-roles');
const tenant_groups_1 = require('./tenant-groups');
const logger_1 = require('../utils/logger');
const log = (0, logger_1.createLogger)('UiSession');
/**
 * Email-scoped single-flight for provider refresh.
 *
 * - Scope: per normalized email (one active UI session per email).
 * - At most one `refreshOidcTokens` provider call runs for the same email
 *   inside the refresh window when locking is required. Concurrent callers
 *   share the same promise (single-flight) rather than issuing duplicate
 *   refresh requests that could exhaust single-use refresh tokens.
 * - Lock timeout: 10s. If the in-flight promise does not settle within
 *   the timeout, the lock is considered stale, removed, and the next caller
 *   creates a fresh attempt (fail closed — the timed-out attempt does not
 *   delete newer state; see ui-oidc-store Lua CAS).
 * - Crash recovery: in-memory Map is per-process; process death clears
 *   all locks. Next request after restart acquires a new lock normally.
 * - Retry: waiters receive the same result as the leader. If refresh
 *   fails (null), the lock is cleared and the next request in the refresh
 *   window will attempt a new provider call (single retry per window).
 * - Rotation: if the provider returns a new `refresh_token`, it is persisted
 *   via `setUiOidcRefreshTokenWithExpiry`; if not, the existing token is
 *   kept. The access-token forward/reverse replacement is atomic via Lua
 *   in the store and prevents stale writers from deleting newer mappings.
 */
exports.REFRESH_SINGLE_FLIGHT_TIMEOUT_MS = 10_000;
const refreshSingleFlight = new Map();
function clearRefreshSingleFlightForTests() {
  refreshSingleFlight.clear();
}
function getRefreshSingleFlightSizeForTests() {
  return refreshSingleFlight.size;
}
function getRefreshLockKey(email) {
  return (0, ui_oidc_store_1.normalizeUiIdentityEmail)(email);
}
function getBearerToken(req) {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
function serializeN8nUser(user) {
  return user
    ? {
        id: user.id,
        email: user.email,
        disabled: user.disabled,
        role: user.role ? { slug: user.role.slug, displayName: user.role.displayName } : null,
      }
    : null;
}
function tryGetTokenExpiryMs(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return undefined;
    }
    let base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}
async function tryGetLocalUiSession(token, deps) {
  const { getUiSessionIssueId } = resolveSessionStore(deps);
  if (!_config_1.UI_AUTH_JWT_SECRET) {
    return null;
  }
  const verification = await (0, jose_1.jwtVerify)(
    token,
    (0, crypto_1.createSecretKey)(Buffer.from(_config_1.UI_AUTH_JWT_SECRET)),
    {
      issuer: _config_1.UI_AUTH_JWT_ISSUER,
      audience: _config_1.UI_AUTH_JWT_AUDIENCE,
    },
  );
  const payload = verification.payload;
  if (!payload.sub || !payload.email || !payload.oidc) return null;
  // Per-session revocation: the credential's issue id must match the value
  // currently stored server-side. Logout (or another login overwriting the
  // single-slot record) deletes it, which revokes the credential.
  const currentSessionId = await getUiSessionIssueId(payload.email);
  if (!payload.sid || !currentSessionId || payload.sid !== currentSessionId) {
    return null;
  }
  return {
    subject: payload.sub,
    email: payload.email,
    preferredUsername: payload.preferredUsername,
    name: payload.name,
    issuer: payload.oidc.issuer,
    audience: payload.oidc.audience,
    claims: payload.oidc.claims,
    expiresAt: verification.payload.exp ? verification.payload.exp * 1000 : undefined,
  };
}
async function tryGetUpstreamUiSession(token) {
  const config = (0, n8n_oidc_1.getN8nOidcConfigFromEnv)();
  if (!config.clientId) {
    return null;
  }
  const discovery = await (0, oidc_provider_1.fetchOidcDiscoveryDocument)(config);
  const claims = await (0, oidc_provider_1.fetchOidcUserInfo)({ accessToken: token, discovery, config });
  if (!claims) {
    return null;
  }
  const identity = (0, oidc_provider_1.extractOidcIdentity)({ claims, discovery, config });
  if (!identity.email) {
    return null;
  }
  return {
    subject: identity.subject,
    email: identity.email,
    preferredUsername: identity.preferredUsername,
    name: identity.name,
    issuer: identity.issuer,
    audience: identity.audience,
    claims: identity.claims,
    expiresAt: tryGetTokenExpiryMs(token),
  };
}
async function buildUpstreamSessionFromToken(token, expiresAt) {
  const session = await tryGetUpstreamUiSession(token);
  if (!session) {
    return null;
  }
  if (expiresAt) {
    session.expiresAt = expiresAt;
  }
  return session;
}
async function refreshSessionByEmailInner(email, _currentAccessToken, deps) {
  const {
    getUiOidcRefreshTokenRecord,
    getUiSessionIssueId: getSid,
    setUiOidcAccessTokenRecord,
    setUiOidcIdToken,
    setUiOidcRefreshTokenWithExpiry,
  } = resolveSessionStore(deps);
  const refreshTokenRecord = await getUiOidcRefreshTokenRecord(email);
  if (!refreshTokenRecord?.token) {
    log.debug('Refresh attempted but no refresh token stored', { email });
    return null;
  }
  if ((0, ui_auth_token_1.isRefreshTokenExpired)(refreshTokenRecord.expiresAt)) {
    log.warn('Refresh token is expired', { email });
    return null;
  }
  log.info('Refresh attempted', { email });
  try {
    const config = (0, n8n_oidc_1.getN8nOidcConfigFromEnv)();
    const discovery = await (0, oidc_provider_1.fetchOidcDiscoveryDocument)(config);
    const refreshed = await (0, oidc_provider_1.refreshOidcTokens)({
      refreshToken: refreshTokenRecord.token,
      discovery,
      config,
    });
    if (!refreshed.access_token) {
      log.warn('Refresh failed: no access_token in response', { email });
      return null;
    }
    log.info('Refresh succeeded', { email });
    const refreshedExpiresAt = (0, ui_auth_token_1.resolveAccessTokenExpiresAt)(refreshed.expires_in);
    const session = await buildUpstreamSessionFromToken(refreshed.access_token, refreshedExpiresAt);
    if (!session) {
      log.warn('Refresh succeeded but failed to build session from new token', { email });
      return null;
    }
    if (refreshed.refresh_token) {
      const refreshExpiresAt = refreshed.refresh_expires_in
        ? Date.now() + refreshed.refresh_expires_in * 1000
        : undefined;
      await setUiOidcRefreshTokenWithExpiry(email, refreshed.refresh_token, refreshExpiresAt);
    }
    if (refreshed.id_token) {
      await setUiOidcIdToken(email, refreshed.id_token);
    }
    await setUiOidcAccessTokenRecord(email, refreshed.access_token, refreshedExpiresAt);
    // Invalidate tenant roles and groups cache — will be re-fetched with new token on next session call
    await (0, tenant_roles_1.invalidateTenantRoles)(email);
    await (0, tenant_groups_1.invalidateTenantGroups)(email);
    const refreshedToken = await (0, ui_auth_token_1.issueUiSessionToken)({
      oidc: {
        subject: session.subject,
        email: session.email,
        preferredUsername: session.preferredUsername,
        name: session.name,
        issuer: session.issuer,
        audience: session.audience,
        claims: session.claims,
      },
      upstreamAccessToken: refreshed.access_token,
      upstreamExpiresAt: refreshedExpiresAt,
      sessionId: (await getSid(email)) ?? undefined,
    });
    return { session, refreshedToken, upstreamAccessToken: refreshed.access_token };
  } catch (error) {
    log.warn('Refresh failed with exception', {
      email,
      message: error instanceof Error ? error.message : 'Unknown refresh error',
    });
    return null;
  }
}
function refreshSessionByEmail(email, currentAccessToken, deps) {
  const lockKey = getRefreshLockKey(email);
  const now = Date.now();
  const existing = refreshSingleFlight.get(lockKey);
  if (existing) {
    if (now - existing.startedAt < exports.REFRESH_SINGLE_FLIGHT_TIMEOUT_MS) {
      return existing.promise;
    }
    // Timeout: stale lock, fail closed for previous attempt and allow new attempt
    log.warn('Refresh single-flight timeout, releasing stale lock', { email });
    refreshSingleFlight.delete(lockKey);
  }
  const promise = (async () => {
    try {
      // Bounded provider call: refreshSessionByEmailInner has its own try/catch
      // and returns null on failure (fail closed). No deletion of newer state
      // occurs on timeout — the store's Lua CAS prevents stale delete.
      const result = await refreshSessionByEmailInner(email, currentAccessToken, deps);
      return result;
    } finally {
      refreshSingleFlight.delete(lockKey);
    }
  })();
  refreshSingleFlight.set(lockKey, { promise, startedAt: now });
  return promise;
}
async function resolveLocalUiSession(token, deps) {
  let session;
  try {
    session = await tryGetLocalUiSession(token, deps);
  } catch (error) {
    // jose.jwtVerify throws JWTExpired for fully expired tokens. Those must be
    // rejected without attempting a refresh; the caller will see a null session
    // and the X-UI-Auth-Token will not be set.
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('jwt expired') || message.toLowerCase().includes('exp claim')) {
      return null;
    }
    return null;
  }
  if (!session) {
    return null;
  }
  // Fully expired separate JWTs are rejected outright — they cannot be refreshed.
  if ((0, ui_auth_token_1.isSeparateTokenExpired)(session.expiresAt)) {
    return null;
  }
  if (!(0, ui_auth_token_1.shouldRefreshSeparateToken)(session.expiresAt)) {
    return { session };
  }
  const refreshed = await refreshSessionByEmail(session.email, undefined, deps);
  if (refreshed) {
    return refreshed;
  }
  // Within pre-expiry window but refresh failed — reject rather than fall back to
  // a soon-to-expire credential so the caller can re-authenticate.
  return null;
}
async function resolveUpstreamUiSession(token, deps) {
  const { getUiOidcAccessTokenRecord } = resolveSessionStore(deps);
  const record = await getUiOidcAccessTokenRecord(token);
  // Raw access tokens must be server-known: logout deletes the record, so a
  // token without one is unknown or revoked and is never trusted on its own.
  if (!record?.email) {
    return null;
  }
  const knownExpiresAt = record.expiresAt;
  if ((0, ui_auth_token_1.shouldRefreshAccessToken)(knownExpiresAt)) {
    const session = await buildUpstreamSessionFromToken(token, knownExpiresAt);
    if (!session) {
      return await refreshSessionByEmail(record.email, token, deps);
    }
    const refreshed = await refreshSessionByEmail(record.email, token, deps);
    return refreshed ?? null;
  }
  const session = await buildUpstreamSessionFromToken(token, knownExpiresAt);
  if (session) {
    return { session };
  }
  return await refreshSessionByEmail(record.email, token, deps);
}
async function getUiSession(req, deps) {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    return _config_1.UI_AUTH_USE_SEPARATE_TOKEN
      ? await resolveLocalUiSession(token, deps)
      : await resolveUpstreamUiSession(token, deps);
  } catch {
    return null;
  }
}
