export const KEYCLOAK_URL = process.env.KEYCLOAK_URL || '';
export const MASTER_ADMIN = process.env.MASTER_ADMIN || '';
export const MASTER_ADMIN_PASSWORD = process.env.MASTER_ADMIN_PASSWORD || '';
export const AUTH_REALM_NAME = process.env.AUTH_REALM_NAME || '';
export const AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID || '';
export const AUTH_CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET || '';
export const SPA_CLIENT_ID = process.env.SPA_CLIENT_ID || 'external-ui';
export const SPA_REDIRECT_URIS = (
  process.env.SPA_REDIRECT_URIS || 'http://localhost:5173/ui/*,http://localhost:5678/ui/*'
)
  .split(',')
  .map((s) => s.trim());
export const SPA_WEB_ORIGINS = (process.env.SPA_WEB_ORIGINS || 'http://localhost:5173,http://localhost:5678')
  .split(',')
  .map((s) => s.trim());
