"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTenantRoles = resolveTenantRoles;
exports.invalidateTenantRoles = invalidateTenantRoles;
const ui_oidc_store_1 = require("./ui-oidc-store");
const resolve_session_cache_1 = require("./resolve-session-cache");
/**
 * Cache-aside resolution for tenant roles.
 */
async function resolveTenantRoles(params) {
    const result = await (0, resolve_session_cache_1.resolveSessionCache)({
        email: params.email,
        ssoUserId: params.ssoUserId,
        accessToken: params.accessToken,
        label: 'tenant roles',
        getCached: ui_oidc_store_1.getUiTenantRoles,
        setCached: ui_oidc_store_1.setUiTenantRoles,
        fetchFn: params.fetchFn,
    });
    return result ?? [];
}
/**
 * Invalidates the cached tenant roles for a user (e.g. on token refresh).
 */
async function invalidateTenantRoles(email) {
    await (0, ui_oidc_store_1.deleteUiTenantRoles)(email);
}
