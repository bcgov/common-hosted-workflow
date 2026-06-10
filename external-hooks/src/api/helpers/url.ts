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

export function buildUiAppUrl(path: string) {
  const configuredBaseUrl = (process.env.UI_APP_BASE_URL || '/ui').trim();
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

  if (configuredBaseUrl.startsWith('http://') || configuredBaseUrl.startsWith('https://')) {
    const baseUrl = configuredBaseUrl.endsWith('/') ? configuredBaseUrl : `${configuredBaseUrl}/`;
    return new URL(normalizedPath, baseUrl).toString();
  }

  const basePath = configuredBaseUrl === '/' ? '' : configuredBaseUrl.replace(/\/$/, '');
  return `${basePath}/${normalizedPath}`;
}
