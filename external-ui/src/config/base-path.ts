export function getAppBasePath() {
  const base = import.meta.env.BASE_URL;

  return base === '/' ? '' : base.replace(/\/$/, '');
}

export function withAppBasePath(path: string) {
  const basePath = getAppBasePath();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${basePath}${normalizedPath}`;
}
