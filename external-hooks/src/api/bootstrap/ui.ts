import path from 'node:path';
import { type Express, type Request, type Response, static as serveStatic } from 'express';
import { buildUiApiRouter } from '../routes/ui-api';
import type { ApiRouteContext } from '../types/routes';

export function mountUi(
  app: Express,
  routeContext: ApiRouteContext,
  uiPath: string | undefined,
  externalUiEnabled: boolean,
) {
  if (!uiPath || !externalUiEnabled) {
    return;
  }

  const indexPath = path.resolve(uiPath, 'index.html');

  app.use('/ui', serveStatic(uiPath, { index: 'index.html' }));
  app.get(/^\/ui\/.*$/, (_req: Request, res: Response) => {
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(404).send('UI asset not found');
      }
    });
  });

  app.use('/ui-api', buildUiApiRouter(routeContext));
}
