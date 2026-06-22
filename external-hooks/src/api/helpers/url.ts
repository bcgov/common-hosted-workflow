import { UI_APP_BASE_URL } from '@config';

export function appendQueryParam(urlOrPath: string, key: string, value: string) {
  try {
    const url = new URL(urlOrPath);
    url.searchParams.set(key, value);
    return url.toString();
  } catch {
    const separator = urlOrPath.includes('?') ? '&' : '?';
    return `${urlOrPath}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
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
