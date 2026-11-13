'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.resolveTenantGroups = resolveTenantGroups;
exports.invalidateTenantGroups = invalidateTenantGroups;
const ui_oidc_store_1 = require('./ui-oidc-store');
const resolve_session_cache_1 = require('./resolve-session-cache');
/**
 * Cache-aside resolution for tenant groups.
 */
async function resolveTenantGroups(params) {
  const result = await (0, resolve_session_cache_1.resolveSessionCache)({
    email: params.email,
    ssoUserId: params.ssoUserId,
    accessToken: params.accessToken,
    label: 'tenant groups',
    getCached: ui_oidc_store_1.getUiTenantGroups,
    setCached: ui_oidc_store_1.setUiTenantGroups,
    fetchFn: params.fetchFn,
  });
  return result ?? [];
}
/**
 * Invalidates the cached tenant groups for a user (e.g. on token refresh).
 */
async function invalidateTenantGroups(email) {
  await (0, ui_oidc_store_1.deleteUiTenantGroups)(email);
}
