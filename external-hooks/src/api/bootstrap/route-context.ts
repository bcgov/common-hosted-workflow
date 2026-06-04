import { createAuthMiddleware, createWorkflowInteractionTenantMiddleware } from '../middlewares';
import type { N8nRepositoryService } from '../services/n8n-repository';
import type { CustomRepositoryService } from '../services/custom-repository';
import type { ApiRouteContext } from '../types/routes';
import type { ApiServices } from '../types/services';

type BuildRouteContextParams = {
  services: ApiServices;
  repositoryService: N8nRepositoryService;
  customRepositoryService: CustomRepositoryService;
  globalOwnerRoleSlug: string;
  globalAdminRoleSlug: string;
};

export function buildRouteContext({
  services,
  repositoryService,
  customRepositoryService,
  globalOwnerRoleSlug,
  globalAdminRoleSlug,
}: BuildRouteContextParams): ApiRouteContext {
  const { apiKeyAuthMiddleware, adminAuthMiddleware } = createAuthMiddleware({
    services,
    globalOwnerRoleSlug,
    globalAdminRoleSlug,
  });

  const workflowInteractionTenantMiddleware = createWorkflowInteractionTenantMiddleware({
    n8nRepositories: {
      project: repositoryService.raw.project,
      projectRelation: repositoryService.raw.projectRelation,
    },
    customRepositories: {
      tenantProjectRelation: customRepositoryService.tenantProjectRelation,
    },
  });

  return {
    apiKeyAuthMiddleware,
    adminAuthMiddleware,
    workflowInteractionTenantMiddleware,
    repositoryService,
    customRepositoryService,
    services,
  };
}
