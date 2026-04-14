import { drizzle } from 'drizzle-orm/node-postgres';
import { ActionRequestRepository } from '../db/repository/workflow-interaction-layer/action-request';
import { MessageRepository } from '../db/repository/workflow-interaction-layer/message';
import { TenantProjectRelationRepository } from '../db/repository/workflow-interaction-layer/tenant-project-relation';
import { createAdminRouter } from './admin';
import { N8N_API_KEY_SERVICE_PATH, N8N_DB_PATH, N8N_DI_PATH } from './constants/n8n-paths';
import { createAuthMiddleware, createWorkflowInteractionTenantMiddleware } from './middleware';
import type { CustomRepositories, N8nRepositories } from './types/repositories';
import { handleErrorResponse } from './utils/errors';
import { createLogger } from './utils/logger';
import { mountSwaggerUi } from './swagger-ui';

const log = createLogger('CustomAPIs');
import { createActionRequestRouter } from './workflow-interaction-layer/action-request';
import { createMessageRouter } from './workflow-interaction-layer/message';

/**
 * n8n `ready` hook: builds auth middleware, Drizzle-backed repos, and mounts Express routers.
 * Admin lives under `/rest/custom/admin`; messages and actions both mount on `/rest/custom/v1` with
 * disjoint paths (two `Router` instances, merged by Express on the same prefix).
 */
export function createHookConfig() {
  return {
    n8n: {
      ready: [
        async function (server: { app: any }) {
          log.info('Initializing Custom Endpoints...');

          const { Container } = require(N8N_DI_PATH);
          const {
            withTransaction,
            UserRepository,
            ProjectRepository,
            ProjectRelationRepository,
            WorkflowRepository,
            SharedWorkflowRepository,
            ExecutionRepository,
            GLOBAL_OWNER_ROLE,
            GLOBAL_ADMIN_ROLE,
          } = require(N8N_DB_PATH);
          const { PublicApiKeyService } = require(N8N_API_KEY_SERVICE_PATH);

          const apiKeyService = Container.get(PublicApiKeyService);
          const n8nRepositories: N8nRepositories = {
            user: Container.get(UserRepository),
            project: Container.get(ProjectRepository),
            projectRelation: Container.get(ProjectRelationRepository),
            workflow: Container.get(WorkflowRepository),
            sharedWorkflow: Container.get(SharedWorkflowRepository),
            withTransaction,
            execution: Container.get(ExecutionRepository),
          };

          const { apiKeyAuthMiddleware, adminAuthMiddleware } = createAuthMiddleware({
            apiKeyService,
            globalOwnerRoleSlug: GLOBAL_OWNER_ROLE.slug,
            globalAdminRoleSlug: GLOBAL_ADMIN_ROLE.slug,
          });

          const databaseUrl = process.env.CUSTOM_DATABASE_URL;
          if (!databaseUrl) {
            throw new Error('CUSTOM_DATABASE_URL is not set');
          }
          const db = drizzle(databaseUrl);
          const { app } = server;

          const customRepositories: CustomRepositories = {
            tenantProjectRelation: new TenantProjectRelationRepository(db),
            message: new MessageRepository(db),
            actionRequest: new ActionRequestRepository(db),
          };

          const workflowInteractionTenantMiddleware = createWorkflowInteractionTenantMiddleware({
            n8nRepositories: {
              project: n8nRepositories.project,
              projectRelation: n8nRepositories.projectRelation,
            },
            customRepositories: {
              tenantProjectRelation: customRepositories.tenantProjectRelation,
            },
          });

          const adminRouter = createAdminRouter({
            adminAuthMiddleware,
            n8nRepositories,
            customRepositories,
          });

          const messageRouter = createMessageRouter({
            apiKeyAuthMiddleware,
            workflowInteractionTenantMiddleware,
            n8nRepositories,
            customRepositories,
          });

          const actionRequestRouter = createActionRequestRouter({
            apiKeyAuthMiddleware,
            workflowInteractionTenantMiddleware,
            n8nRepositories,
            customRepositories,
          });

          mountSwaggerUi(app);

          app.use('/rest/custom/admin', adminRouter);
          app.use('/rest/custom/v1', messageRouter);
          app.use('/rest/custom/v1', actionRequestRouter);
          app.use(handleErrorResponse);

          log.info('Custom Routes Active.');
        },
      ],
    },
  };
}
