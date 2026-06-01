import { type Express, static as serveStatic } from 'express';

const defaultAssetsPath = process.env.EXTERNAL_HOOK_ASSETS_PATH || 'api/assets';

export function mountAssets(app: Express, assetsPath = defaultAssetsPath) {
  app.use(
    '/assets',
    serveStatic(assetsPath, {
      index: false,
      maxAge: '1h',
      setHeaders(res) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    }),
  );
}
