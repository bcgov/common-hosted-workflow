'use strict';
// ---------------------------------------------------------------------------
// Centralized environment configuration
//
// Every process.env reference in the external-hooks src codebase should live
// here (or be derived from values here). This provides a single lookup for all
// environment variables, their defaults, and processed / derived values.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, '__esModule', { value: true });
exports.AUTHZ_CLIENT_ID =
  exports.AUTHZ_TOKEN_ENDPOINT =
  exports.AUTHZ_ENVIRONMENT =
  exports.AUTHZ_INTEGRATION_ID =
  exports.AUTHZ_SERVICE_URL =
  exports.CHEFS_ALLOWED_ORIGINS =
  exports.CHEFS_GATEWAY_URL =
  exports.CHEFS_BASE_URL =
  exports.CSTAR_API_BASE_URL =
  exports.CSTAR_BASE_URL =
  exports.OIDC_PROVIDER_TIMEOUT_MS =
  exports.SSO_RESTRICT_NO_ROLE =
  exports.OIDC_ROLES_CLAIM =
  exports.OIDC_SCOPES =
  exports.OIDC_REDIRECT_URI =
  exports.OIDC_CLIENT_SECRET =
  exports.OIDC_CLIENT_ID =
  exports.OIDC_USE_MANUAL_ENDPOINTS =
  exports.OIDC_END_SESSION_ENDPOINT =
  exports.OIDC_JWKS_URI =
  exports.OIDC_USERINFO_ENDPOINT =
  exports.OIDC_TOKEN_ENDPOINT =
  exports.OIDC_AUTHORIZATION_ENDPOINT =
  exports.OIDC_ISSUER =
  exports.N8N_USER_MANAGEMENT_JWT_SECRET =
  exports.UI_AUTH_USE_SEPARATE_TOKEN =
  exports.UI_AUTH_JWT_AUDIENCE =
  exports.UI_AUTH_JWT_ISSUER =
  exports.UI_AUTH_JWT_SECRET =
  exports.UI_OIDC_REDIS_PREFIX =
  exports.UI_OIDC_REDIS_PASSWORD =
  exports.UI_OIDC_REDIS_URL =
  exports.UI_API_BASE_URL =
  exports.UI_APP_BASE_URL =
  exports.EXTERNAL_HOOK_ASSETS_PATH =
  exports.EXTERNAL_UI_ENABLED =
  exports.EXTERNAL_UI_PATH =
  exports.FEATURES_ENABLED =
  exports.ENABLE_SWAGGER_UI =
  exports.READONLY_MODE =
  exports.CLUSTER =
  exports.IS_DEVELOPMENT =
  exports.IS_PRODUCTION =
  exports.N8N_BASE_URL =
  exports.INTERNAL_AUTH_TOKEN =
  exports.N8N_ENCRYPTION_KEY =
  exports.N8N_PROTOCOL =
  exports.CUSTOM_DATABASE_URL =
  exports.LOG_LEVEL =
  exports.NODE_ENV =
    void 0;
exports.WIL_TRIGGER_NODE_TYPES =
  exports.WIL_N8N_NODE_TRIGGERS_ENABLED =
  exports.EXECUTIONS_MODE =
  exports.RATE_LIMIT_ENFORCEMENT_ENABLED =
  exports.RATE_LIMIT_TIMEZONE =
  exports.GRAFANA_PROJECTS_SECRET =
  exports.OIDC_COOKIE_SECRET_BASE =
  exports.AUTHZ_CLIENT_SECRET =
    void 0;
// Core / Infrastructure
exports.NODE_ENV = process.env.NODE_ENV ?? '';
exports.LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
exports.CUSTOM_DATABASE_URL = process.env.CUSTOM_DATABASE_URL ?? '';
exports.N8N_PROTOCOL = process.env.N8N_PROTOCOL ?? '';
exports.N8N_ENCRYPTION_KEY = process.env.N8N_ENCRYPTION_KEY ?? '';
exports.INTERNAL_AUTH_TOKEN = process.env.INTERNAL_AUTH_TOKEN ?? '';
exports.N8N_BASE_URL = (process.env.N8N_BASE_URL || '').trim();
// Environment helpers
exports.IS_PRODUCTION = exports.NODE_ENV === 'production';
exports.IS_DEVELOPMENT = exports.NODE_ENV === 'development';
// Cluster / disaster recovery
// Set by Helm from the Makefile's CLUSTER value.
exports.CLUSTER = (process.env.CLUSTER ?? '').trim().toLowerCase();
exports.READONLY_MODE = exports.CLUSTER === 'golddr';
// Feature flags
exports.ENABLE_SWAGGER_UI = process.env.ENABLE_SWAGGER_UI;
exports.FEATURES_ENABLED = process.env.FEATURES_ENABLED ?? '';
// External UI / Assets
exports.EXTERNAL_UI_PATH = process.env.EXTERNAL_UI_PATH ?? '';
exports.EXTERNAL_UI_ENABLED = process.env.EXTERNAL_UI_ENABLED === 'true';
exports.EXTERNAL_HOOK_ASSETS_PATH = process.env.EXTERNAL_HOOK_ASSETS_PATH || 'api/assets';
exports.UI_APP_BASE_URL = (process.env.UI_APP_BASE_URL || `${exports.N8N_BASE_URL}/ui`).trim();
exports.UI_API_BASE_URL = `${exports.N8N_BASE_URL}/ui-api`;
// UI OIDC – Redis store
exports.UI_OIDC_REDIS_URL = process.env.UI_OIDC_REDIS_URL || 'redis://localhost:6379';
exports.UI_OIDC_REDIS_PASSWORD = process.env.UI_OIDC_REDIS_PASSWORD || '';
exports.UI_OIDC_REDIS_PREFIX = process.env.UI_OIDC_REDIS_PREFIX || 'chwf:ui-oidc:';
// UI OIDC – JWT session
exports.UI_AUTH_JWT_SECRET = process.env.UI_AUTH_JWT_SECRET || process.env.N8N_USER_MANAGEMENT_JWT_SECRET || '';
exports.UI_AUTH_JWT_ISSUER = process.env.UI_AUTH_JWT_ISSUER || 'chwf-ui-api';
exports.UI_AUTH_JWT_AUDIENCE = process.env.UI_AUTH_JWT_AUDIENCE || 'chwf-ui';
exports.UI_AUTH_USE_SEPARATE_TOKEN = process.env.UI_AUTH_USE_SEPARATE_TOKEN === 'true';
exports.N8N_USER_MANAGEMENT_JWT_SECRET = process.env.N8N_USER_MANAGEMENT_JWT_SECRET ?? '';
// n8n OIDC – base provider config (single source; no separate UI redirect)
// Provider configuration is consolidated via N8nOidcConfig / OidcProviderConfig.
// The sole browser callback is `${N8N_BASE_URL}/rest/auth/oidc/callback`.
// Deployment owners confirmed no active provider registration targets the legacy
// `/ui-api/auth/callback` URI (checked docs/external-hooks/oidc.md and
// docs/external-ui/tenant-roles-in-session.md on 2026-08-31); legacy URI
// removal is intentional and provider docs now list only the single callback.
exports.OIDC_ISSUER = process.env.OIDC_ISSUER || '';
exports.OIDC_AUTHORIZATION_ENDPOINT = process.env.OIDC_AUTHORIZATION_ENDPOINT || '';
exports.OIDC_TOKEN_ENDPOINT = process.env.OIDC_TOKEN_ENDPOINT || '';
exports.OIDC_USERINFO_ENDPOINT = process.env.OIDC_USERINFO_ENDPOINT || '';
exports.OIDC_JWKS_URI = process.env.OIDC_JWKS_URI || '';
exports.OIDC_END_SESSION_ENDPOINT = process.env.OIDC_END_SESSION_ENDPOINT || '';
exports.OIDC_USE_MANUAL_ENDPOINTS = process.env.OIDC_USE_MANUAL_ENDPOINTS === 'true';
exports.OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID || '';
exports.OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || '';
exports.OIDC_REDIRECT_URI = `${exports.N8N_BASE_URL}/rest/auth/oidc/callback`;
exports.OIDC_SCOPES = process.env.OIDC_SCOPES || 'openid email profile';
exports.OIDC_ROLES_CLAIM = process.env.OIDC_ROLES_CLAIM || 'roles';
exports.SSO_RESTRICT_NO_ROLE = process.env.SSO_RESTRICT_NO_ROLE === 'true';
// Bounded provider request timeout (ms). All OIDC discovery, token,
// refresh, and userinfo fetches abort after this deadline and surface a
// stable timeout error (`OIDC provider request timed out`) instead of
// hanging indefinitely. Default 10s, override via OIDC_PROVIDER_TIMEOUT_MS.
exports.OIDC_PROVIDER_TIMEOUT_MS = Number.parseInt(process.env.OIDC_PROVIDER_TIMEOUT_MS ?? '10000', 10);
// CSTAR – Tenant & user management
exports.CSTAR_BASE_URL = process.env.CSTAR_BASE_URL || '';
exports.CSTAR_API_BASE_URL = exports.CSTAR_BASE_URL ? `${exports.CSTAR_BASE_URL}/api/v1` : '';
// CHEFS – Common Hosted Form Service
exports.CHEFS_BASE_URL = process.env.CHEFS_BASE_URL || '';
exports.CHEFS_GATEWAY_URL = exports.CHEFS_BASE_URL ? `${exports.CHEFS_BASE_URL}/app/gateway/v1` : '';
/**
 * Additional CHEFS origins a credential or trigger's Base URL may resolve to,
 * beyond the configured `CHEFS_BASE_URL` origin. The external UI loads a
 * `<script>` from this origin and embeds it via `innerHTML`, so any origin not
 * in this allowlist (or the `CHEFS_BASE_URL` origin) is rejected in favour of
 * the configured env value — an unvalidated origin here is a stored-XSS hole.
 */
exports.CHEFS_ALLOWED_ORIGINS = (process.env.CHEFS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
// CSS SSO / AuthZ – all required; missing any disables CSS SSO
exports.AUTHZ_SERVICE_URL = process.env.AUTHZ_SERVICE_URL || '';
exports.AUTHZ_INTEGRATION_ID = process.env.AUTHZ_INTEGRATION_ID || '';
exports.AUTHZ_ENVIRONMENT = process.env.AUTHZ_ENVIRONMENT || '';
exports.AUTHZ_TOKEN_ENDPOINT = process.env.AUTHZ_TOKEN_ENDPOINT || '';
exports.AUTHZ_CLIENT_ID = process.env.AUTHZ_CLIENT_ID || '';
exports.AUTHZ_CLIENT_SECRET = process.env.AUTHZ_CLIENT_SECRET || '';
// Derived: cookie signing key for OIDC state cookies
exports.OIDC_COOKIE_SECRET_BASE = exports.N8N_ENCRYPTION_KEY || exports.OIDC_CLIENT_SECRET || 'n8n-oidc-hook-secret';
// Shared secret the Infinity datasource sends as X-Grafana-Secret on every request to the
// projects/workflows endpoints. Proves the caller is the configured Grafana instance.
// The endpoint is disabled (503) when this is empty.
exports.GRAFANA_PROJECTS_SECRET = process.env.GRAFANA_PROJECTS_SECRET ?? '';
// --- Per-project execution rate limiting ---------------------------------------------------
// Timezone in which weekly (ISO-8601) and yearly execution period boundaries are computed.
exports.RATE_LIMIT_TIMEZONE = process.env.RATE_LIMIT_TIMEZONE || 'America/Vancouver';
// Master switch for workflow.preExecute rate-limit enforcement; 'false' disables all enforcement.
exports.RATE_LIMIT_ENFORCEMENT_ENABLED = process.env.RATE_LIMIT_ENFORCEMENT_ENABLED !== 'false';
// n8n execution mode; in queue mode only worker processes count and enforce usage.
exports.EXECUTIONS_MODE = process.env.EXECUTIONS_MODE ?? 'regular';
// --- WIL Trigger node (n8n-node trigger targets) ---------------------------------------------
/** Kill switch for starting workflows through the WIL Trigger node. Enabled unless set to "false". */
exports.WIL_N8N_NODE_TRIGGERS_ENABLED = (process.env.WIL_N8N_NODE_TRIGGERS_ENABLED ?? 'true') !== 'false';
/**
 * Node type strings that identify the WIL Trigger node in saved workflow JSON. n8n prefixes a node with its
 * package name: `CUSTOM` for nodes loaded from a custom extensions folder (this deployment) and
 * `community-nodes` for the installed package, so both are accepted. Override with a comma-separated list.
 */
exports.WIL_TRIGGER_NODE_TYPES = (process.env.WIL_TRIGGER_NODE_TYPES || 'CUSTOM.wilTrigger,community-nodes.wilTrigger')
  .split(',')
  .map((type) => type.trim())
  .filter(Boolean);
