import { createAuthMiddleware, createWorkflowInteractionTenantMiddleware } from '../middlewares';
import type { CustomRepositories, N8nRepositories } from '../types/repositories';
import type { ApiRouteContext } from '../types/routes';
import type { ApiServices } from '../types/services';

type BuildRouteContextParams = {
  services: ApiServices;
  n8nRepositories: N8nRepositories;
  customRepositories: CustomRepositories;
  globalOwnerRoleSlug: string;
  globalAdminRoleSlug: string;
};

export function buildRouteContext({
  services,
  n8nRepositories,
  customRepositories,
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
      project: n8nRepositories.project,
      projectRelation: n8nRepositories.projectRelation,
    },
    customRepositories: {
      tenantProjectRelation: customRepositories.tenantProjectRelation,
    },
  });

  return {
    apiKeyAuthMiddleware,
    adminAuthMiddleware,
    workflowInteractionTenantMiddleware,
    n8nRepositories,
    customRepositories,
    services,
  };
}
