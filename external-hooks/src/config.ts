// ---------------------------------------------------------------------------
// Centralized environment configuration
//
// Every process.env reference in the external-hooks src codebase should live
// here (or be derived from values here). This provides a single lookup for all
// environment variables, their defaults, and processed / derived values.
// ---------------------------------------------------------------------------

// Core / Infrastructure
export const NODE_ENV = process.env.NODE_ENV ?? '';
export const LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
export const CUSTOM_DATABASE_URL = process.env.CUSTOM_DATABASE_URL ?? '';
export const N8N_PROTOCOL = process.env.N8N_PROTOCOL ?? '';
export const N8N_ENCRYPTION_KEY = process.env.N8N_ENCRYPTION_KEY ?? '';
export const INTERNAL_AUTH_TOKEN = process.env.INTERNAL_AUTH_TOKEN ?? '';

// Environment helpers
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_DEVELOPMENT = NODE_ENV === 'development';

// Feature flags
export const ENABLE_SWAGGER_UI = process.env.ENABLE_SWAGGER_UI;

// External UI / Assets
export const EXTERNAL_UI_PATH = process.env.EXTERNAL_UI_PATH ?? '';
export const EXTERNAL_UI_ENABLED = process.env.EXTERNAL_UI_ENABLED === 'true';
export const EXTERNAL_HOOK_ASSETS_PATH = process.env.EXTERNAL_HOOK_ASSETS_PATH || 'api/assets';
export const UI_APP_BASE_URL = (process.env.UI_APP_BASE_URL || '/ui').trim();

// UI OIDC – Redis store
export const UI_OIDC_REDIS_URL = process.env.UI_OIDC_REDIS_URL || 'redis://localhost:6379';
export const UI_OIDC_REDIS_PASSWORD = process.env.UI_OIDC_REDIS_PASSWORD || '';
export const UI_OIDC_REDIS_PREFIX = process.env.UI_OIDC_REDIS_PREFIX || 'chwf:ui-oidc:';

// UI OIDC – JWT session
export const UI_AUTH_JWT_SECRET = process.env.UI_AUTH_JWT_SECRET || process.env.N8N_USER_MANAGEMENT_JWT_SECRET || '';
export const UI_AUTH_JWT_ISSUER = process.env.UI_AUTH_JWT_ISSUER || 'chwf-ui-api';
export const UI_AUTH_JWT_AUDIENCE = process.env.UI_AUTH_JWT_AUDIENCE || 'chwf-ui';
export const UI_AUTH_USE_SEPARATE_TOKEN = process.env.UI_AUTH_USE_SEPARATE_TOKEN === 'true';
export const N8N_USER_MANAGEMENT_JWT_SECRET = process.env.N8N_USER_MANAGEMENT_JWT_SECRET ?? '';

// n8n OIDC – base provider config
export const OIDC_ISSUER = process.env.OIDC_ISSUER || '';
export const OIDC_AUTHORIZATION_ENDPOINT = process.env.OIDC_AUTHORIZATION_ENDPOINT || '';
export const OIDC_TOKEN_ENDPOINT = process.env.OIDC_TOKEN_ENDPOINT || '';
export const OIDC_USERINFO_ENDPOINT = process.env.OIDC_USERINFO_ENDPOINT || '';
export const OIDC_JWKS_URI = process.env.OIDC_JWKS_URI || '';
export const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID || '';
export const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || '';
export const OIDC_REDIRECT_URI = process.env.OIDC_REDIRECT_URI || '';
export const OIDC_SCOPES = process.env.OIDC_SCOPES || 'openid email profile';
export const OIDC_ROLES_CLAIM = process.env.OIDC_ROLES_CLAIM || 'roles';
export const SSO_RESTRICT_NO_ROLE = process.env.SSO_RESTRICT_NO_ROLE === 'true';

// UI OIDC – only redirect remains UI-specific; shared provider/client config comes from OIDC_*
export const UI_OIDC_REDIRECT_URI = process.env.UI_OIDC_REDIRECT_URI || '';

// CSTAR – Tenant & user management
export const CSTAR_BASE_URL = process.env.CSTAR_BASE_URL || '';
export const CSTAR_API_BASE_URL = CSTAR_BASE_URL ? `${CSTAR_BASE_URL}/api/v1` : '';

// Tenant project sync – auto-provision n8n team projects from CSTAR tenants at login
export const IS_TENANT_PROJECT_SYNC_ENABLED = process.env.IS_TENANT_PROJECT_SYNC_ENABLED === 'true';

// CHEFS gateway
export const CHEFS_GATEWAY_URL = process.env.CHEFS_GATEWAY_URL || '';

// CSS SSO / AuthZ – all required; missing any disables CSS SSO
export const AUTHZ_SERVICE_URL = process.env.AUTHZ_SERVICE_URL || '';
export const AUTHZ_INTEGRATION_ID = process.env.AUTHZ_INTEGRATION_ID || '';
export const AUTHZ_ENVIRONMENT = process.env.AUTHZ_ENVIRONMENT || '';
export const AUTHZ_TOKEN_ENDPOINT = process.env.AUTHZ_TOKEN_ENDPOINT || '';
export const AUTHZ_CLIENT_ID = process.env.AUTHZ_CLIENT_ID || '';
export const AUTHZ_CLIENT_SECRET = process.env.AUTHZ_CLIENT_SECRET || '';

// Derived: cookie signing key for OIDC state cookies
export const OIDC_COOKIE_SECRET_BASE = N8N_ENCRYPTION_KEY || OIDC_CLIENT_SECRET || 'n8n-oidc-hook-secret';
