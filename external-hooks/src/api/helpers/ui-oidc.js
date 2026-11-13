"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOidcConfigFromEnv = getOidcConfigFromEnv;
exports.buildSessionSummary = buildSessionSummary;
exports.buildWhoamiResponse = buildWhoamiResponse;
const config_1 = require("../../config");
// UiOidcConfig is now an alias to the single-source N8nOidcConfig / OidcProviderConfig.
// The sole redirect URI is OIDC_REDIRECT_URI = `${N8N_BASE_URL}/rest/auth/oidc/callback`.
// Deployment verification on 2026-08-31 confirmed no active provider registration
// targets the legacy `/ui-api/auth/callback`; that URI is intentionally removed.
const n8n_oidc_1 = require("./n8n-oidc");
/** @deprecated Use getN8nOidcConfigFromEnv() – single injected OIDC config. Kept for transition. */
function getOidcConfigFromEnv() {
    return (0, n8n_oidc_1.getN8nOidcConfigFromEnv)();
}
function buildSessionSummary(session) {
    if (!session) {
        return {
            authenticated: false,
            user: null,
            oidc: null,
            n8nUser: null,
            permissions: null,
            tenantRoles: null,
            tenantGroups: null,
            goldDr: config_1.READONLY_MODE,
        };
    }
    return {
        authenticated: true,
        user: {
            subject: session.subject,
            email: session.email,
            preferredUsername: session.preferredUsername,
            name: session.name,
        },
        oidc: {
            issuer: session.issuer,
            subject: session.subject,
            audience: session.audience,
            email: session.email,
            preferredUsername: session.preferredUsername,
            name: session.name,
            expiresAt: session.expiresAt,
            claims: session.claims,
        },
        n8nUser: session.n8nUser,
        permissions: session.permissions,
        tenantRoles: session.tenantRoles,
        tenantGroups: session.tenantGroups,
        goldDr: config_1.READONLY_MODE,
    };
}
function buildWhoamiResponse(session, userAgent) {
    return {
        oidc: buildSessionSummary(session).oidc,
        n8nUser: session.n8nUser,
        permissions: session.permissions,
        tenantRoles: session.tenantRoles,
        tenantGroups: session.tenantGroups,
        userAgent,
    };
}
