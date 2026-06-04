import type { RequestHandler } from 'express';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { ApiServices } from './services';

export type ApiRouteContext = {
  apiKeyAuthMiddleware: RequestHandler;
  adminAuthMiddleware: RequestHandler;
  workflowInteractionTenantMiddleware: RequestHandler;
  n8nRepositories: N8nRepositories;
  customRepositories: CustomRepositories;
  services: ApiServices;
};
