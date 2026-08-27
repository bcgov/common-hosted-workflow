import { buildApiUrl, clearStoredAppToken } from '../services/backend/axios';
import { sessionState } from '../state/session';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/';

function getCurrentUiPath() {
  const url = new URL(globalThis.location.href);
  url.searchParams.delete('token');
  url.searchParams.delete('session');
  return url.toString();
}

function buildAuthRouteUrl(path: string, params: Record<string, string>) {
  const url = new URL(buildApiUrl(path));

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

export function login() {
  globalThis.location.assign(buildAuthRouteUrl('/ui-api/auth/login', { returnTo: getCurrentUiPath() }));
}

export function getN8nLoginUrl() {
  return buildApiUrl(`${API_BASE_URL}/rest/auth/oidc/login`);
}

export function openN8n() {
  globalThis.location.assign(getN8nLoginUrl());
}

export function logout() {
  const email = sessionState.session?.user.email;
  clearStoredAppToken();
  sessionState.session = null;
  sessionState.isLoading = false;
  globalThis.location.assign(
    buildAuthRouteUrl('/ui-api/auth/logout', {
      returnTo: getCurrentUiPath(),
      ...(email ? { email } : {}),
    }),
  );
}
