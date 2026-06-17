import { type Express, static as serveStatic } from 'express';
import { EXTERNAL_HOOK_ASSETS_PATH } from '@config';

export function mountAssets(app: Express, assetsPath = EXTERNAL_HOOK_ASSETS_PATH) {
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
