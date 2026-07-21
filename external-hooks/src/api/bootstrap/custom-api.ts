import { Router, type Express } from 'express';
import { buildActionRouter } from '../routes/actions';
import { buildActorRouter } from '../routes/actors';
import { buildAdminRouter } from '../routes/admin';
import { buildChefsSubmissionRouter } from '../routes/chefs-submission';
import { buildMessageRouter } from '../routes/messages';
import { buildMultiWebhookWaitRouter } from '../routes/multi-webhook-wait';
import { mountSwaggerUi } from '../swagger-ui';
import type { ApiRouteContext } from '../types/routes';

export function mountCustomApi(app: Express, routeContext: ApiRouteContext) {
  const v1Router = Router();

  v1Router.use('/admin', buildAdminRouter(routeContext));
  v1Router.use(buildActorRouter(routeContext));
  v1Router.use(buildMessageRouter(routeContext));
  v1Router.use(buildActionRouter(routeContext));
  v1Router.use('/chefs', buildChefsSubmissionRouter(routeContext));
  v1Router.use('/multi-webhook-wait', buildMultiWebhookWaitRouter(routeContext));

  mountSwaggerUi(app);
  app.use('/rest/custom/v1', v1Router);
}
