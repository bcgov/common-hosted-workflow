import { type Express, static as serveStatic } from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EXTERNAL_HOOK_ASSETS_PATH } from '@config';

function getOidcFrontendHookMode(): string {
  const raw = (process.env.OIDC_FRONTEND_HOOK_MODE ?? 'redirect').trim().toLowerCase();
  return raw === 'legacy' ? 'legacy' : 'redirect';
}

export function mountAssets(app: Express, assetsPath = EXTERNAL_HOOK_ASSETS_PATH) {
  // Serve the OIDC frontend hook dynamically so a single URL can serve either
  // the redirect or legacy implementation based on backend env.
  // Dockerfile keeps EXTERNAL_FRONTEND_HOOKS_URLS=/assets/oidc-frontend-hook.js as a single entry.
  app.get('/assets/oidc-frontend-hook.js', (req, res) => {
    const mode = getOidcFrontendHookMode();
    try {
      const filePath = path.join(assetsPath, 'oidc-frontend-hook.js');
      let content = readFileSync(filePath, 'utf8');
      if (content.includes('__OIDC_FRONTEND_HOOK_MODE__')) {
        content = content.replaceAll('__OIDC_FRONTEND_HOOK_MODE__', mode);
      }
      res.type('application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(content);
      return;
    } catch {
      // Fall through to static handling if file cannot be read (e.g. in tests where assetsPath is mocked)
    }
    // Fallback: let static middleware try (will 404 if not found)
    res.status(404).send('Not found');
  });

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
