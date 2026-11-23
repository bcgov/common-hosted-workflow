import { Router, type Express } from 'express';
import { buildActionRouter } from '../routes/actions';
import { buildActorRouter } from '../routes/actors';
import { buildAdminRouter } from '../routes/admin';
import { buildChefsSubmissionRouter } from '../routes/chefs-submission';
import { buildGrafanaProjectsRouter } from '../routes/grafana-projects';
import { buildMessageRouter } from '../routes/messages';
import { buildMultiWebhookWaitRouter } from '../routes/multi-webhook-wait';
import { buildTemplatesRouter } from '../routes/templates';
import { createReadOnlyMiddleware } from '../middlewares';
import { mountSwaggerUi } from '../swagger-ui';
import type { ApiRouteContext } from '../types/routes';

export function mountCustomApi(app: Express, routeContext: ApiRouteContext) {
  const v1Router = Router();

  v1Router.use(createReadOnlyMiddleware());

  v1Router.use('/admin', buildAdminRouter(routeContext));
  v1Router.use(buildActorRouter(routeContext));
  v1Router.use(buildMessageRouter(routeContext));
  v1Router.use(buildActionRouter(routeContext));
  v1Router.use('/chefs', buildChefsSubmissionRouter(routeContext));
  v1Router.use('/multi-webhook-wait', buildMultiWebhookWaitRouter(routeContext));

  v1Router.use('/obs/projects', buildGrafanaProjectsRouter(routeContext));

  // Custom workflow template library (N8N_TEMPLATES_HOST points here). Serves
  // /templates/*, /workflows/templates/:id and /health from static JSON.
  v1Router.use(buildTemplatesRouter());

  mountSwaggerUi(app);
  app.use('/rest/custom/v1', v1Router);
}
