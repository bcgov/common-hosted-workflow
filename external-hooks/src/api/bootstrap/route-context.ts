import {
  createAuthMiddleware,
  createInternalBearerMiddleware,
  createWorkflowInteractionTenantMiddleware,
} from '../middlewares';
import type { N8nRepositories } from './n8n-repositories';
import type { CustomRepositories } from './custom-repositories';
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
    userRepository: n8nRepositories.user,
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

  const internalBearerMiddleware = createInternalBearerMiddleware();

  return {
    apiKeyAuthMiddleware,
    adminAuthMiddleware,
    internalBearerMiddleware,
    workflowInteractionTenantMiddleware,
    n8nRepositories,
    customRepositories,
    services,
  };
}
