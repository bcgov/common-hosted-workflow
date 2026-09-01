import { buildApiUrl, clearStoredAppToken } from '../services/backend/axios';
import { prepareLogout } from '../services/backend/auth';
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

export function getLoginUrl() {
  return buildAuthRouteUrl('/rest/auth/oidc/login', { returnTo: getCurrentUiPath() });
}

export function login() {
  globalThis.location.assign(getLoginUrl());
}

export function getN8nLoginUrl() {
  return buildApiUrl('/rest/auth/oidc/login');
}

export function openN8n() {
  globalThis.location.assign(getN8nLoginUrl());
}

export async function logout() {
  const returnTo = getCurrentUiPath();
  // Identity is never self-declared: the bearer-authenticated preparation
  // endpoint returns a short-lived, single-use logout handle. When the
  // session token is already gone or the request fails, fall back to the
  // canonical endpoint without a handle — it still clears the n8n cookie and
  // performs local browser cleanup, but touches no token records.
  let destination = buildAuthRouteUrl('/rest/auth/oidc/logout', { returnTo });
  try {
    destination = (await prepareLogout(returnTo)).logoutUrl;
  } catch {
    // fall through to the handle-less canonical logout
  }
  clearStoredAppToken();
  sessionState.session = null;
  sessionState.isLoading = false;
  globalThis.location.assign(destination);
}
