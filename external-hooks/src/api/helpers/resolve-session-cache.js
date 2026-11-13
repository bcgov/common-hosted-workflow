'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.resolveSessionCache = resolveSessionCache;
const ui_oidc_store_1 = require('./ui-oidc-store');
const logger_1 = require('../utils/logger');
const log = (0, logger_1.createLogger)('SessionCache');
/**
 * Generic cache-aside resolution for session-scoped data.
 *
 * 1. Returns cached value if present in Redis.
 * 2. On cache miss, resolves access token and calls fetchFn.
 * 3. Stores the result in Redis for subsequent calls.
 */
async function resolveSessionCache(params) {
  const { email, ssoUserId, accessToken, label, getCached, setCached, fetchFn } = params;
  const cached = await getCached(email);
  if (cached) {
    return cached;
  }
  const token = accessToken ?? (await (0, ui_oidc_store_1.getUiOidcAccessTokenByEmail)(email));
  if (!token) {
    log.debug(`No access token available for ${label} fetch`, { email });
    return null;
  }
  const result = await fetchFn(ssoUserId, token);
  await setCached(email, result);
  return result;
}
