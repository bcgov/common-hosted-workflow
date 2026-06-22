export const KEYCLOAK_URL = process.env.KEYCLOAK_URL || '';
export const MASTER_ADMIN = process.env.MASTER_ADMIN || '';
export const MASTER_ADMIN_PASSWORD = process.env.MASTER_ADMIN_PASSWORD || '';
export const AUTH_REALM_NAME = process.env.AUTH_REALM_NAME || '';
export const AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID || '';
export const AUTH_CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET || '';
export const AUTH_REDIRECT_URIS = (process.env.AUTH_REDIRECT_URIS || '')
  .split(',')
  .concat(process.env.UI_APP_BASE_URL || '')
  .map((s) => s.trim())
  .filter(Boolean);
