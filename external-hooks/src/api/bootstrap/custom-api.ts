import { Router, type Express } from 'express';
import { buildActionRouter } from '../routes/actions';
import { buildActorRouter } from '../routes/actors';
import { buildAdminRouter } from '../routes/admin';
import { buildMessageRouter } from '../routes/messages';
import { mountSwaggerUi } from '../swagger-ui';
import type { ApiRouteContext } from '../types/routes';

export function mountCustomApi(app: Express, routeContext: ApiRouteContext) {
  const v1Router = Router();

  v1Router.use('/admin', buildAdminRouter(routeContext));
  v1Router.use(buildActorRouter(routeContext));
  v1Router.use(buildMessageRouter(routeContext));
  v1Router.use(buildActionRouter(routeContext));

  mountSwaggerUi(app);
  app.use('/rest/custom/v1', v1Router);
}
