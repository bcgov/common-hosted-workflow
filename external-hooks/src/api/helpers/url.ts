import { UI_APP_BASE_URL } from '@config';

const RELATIVE_URL_BASE = 'http://relative.invalid';

function isAbsoluteUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

/**
 * Set a query parameter on an absolute or relative URL using
 * `URL.searchParams.set()` semantics: existing occurrences of the key are
 * replaced (exactly one remains), existing query parameters and fragments
 * are preserved.
 */
export function appendQueryParam(urlOrPath: string, key: string, value: string) {
  const url = isAbsoluteUrl(urlOrPath) ? new URL(urlOrPath) : new URL(urlOrPath, RELATIVE_URL_BASE);
  url.searchParams.set(key, value);
  return isAbsoluteUrl(urlOrPath) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}

export function appendTokenToReturnTo(returnTo: string, token: string) {
  return appendQueryParam(returnTo, 'token', token);
}

export function appendSessionToReturnTo(returnTo: string, session: string) {
  return appendQueryParam(returnTo, 'session', session);
}

export function buildUiAppUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

  if (UI_APP_BASE_URL.startsWith('http://') || UI_APP_BASE_URL.startsWith('https://')) {
    const baseUrl = UI_APP_BASE_URL.endsWith('/') ? UI_APP_BASE_URL : `${UI_APP_BASE_URL}/`;
    return new URL(normalizedPath, baseUrl).toString();
  }

  const basePath = UI_APP_BASE_URL === '/' ? '' : UI_APP_BASE_URL.replace(/\/$/, '');
  return `${basePath}/${normalizedPath}`;
}
