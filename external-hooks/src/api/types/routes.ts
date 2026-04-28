import type { RequestHandler } from 'express';
import type { CustomRepositories, N8nRepositories } from './repositories';
import type { ApiServices } from './services';

export type ApiRouteContext = {
  apiKeyAuthMiddleware: RequestHandler;
  adminAuthMiddleware: RequestHandler;
  workflowInteractionTenantMiddleware: RequestHandler;
  n8nRepositories: N8nRepositories;
  customRepositories: CustomRepositories;
  services: ApiServices;
};
