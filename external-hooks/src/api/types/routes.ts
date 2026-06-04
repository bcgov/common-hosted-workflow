import type { RequestHandler } from 'express';
import type { N8nRepositoryService } from '../services/n8n-repository';
import type { CustomRepositoryService } from '../services/custom-repository';
import type { ApiServices } from './services';

export type ApiRouteContext = {
  apiKeyAuthMiddleware: RequestHandler;
  adminAuthMiddleware: RequestHandler;
  workflowInteractionTenantMiddleware: RequestHandler;
  repositoryService: N8nRepositoryService;
  customRepositoryService: CustomRepositoryService;
  services: ApiServices;
};
