import { buildApiUrl, clearStoredAppToken } from '../services/backend/axios';
import { sessionState } from '../state/session';

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
