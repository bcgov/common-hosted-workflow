import { drizzle } from 'drizzle-orm/node-postgres';
import {
  MessageRepository,
  TenantProjectRelationRepository,
} from '../db/repository/workflow-interaction-layer/message';
import { createAdminRouter } from './admin';
import { LOG_PREFIX } from './constants/logging';
import { N8N_API_KEY_SERVICE_PATH, N8N_DB_PATH, N8N_DI_PATH } from './constants/n8n-paths';
import { createAuthMiddleware, createMessageTenantProjectMiddleware } from './middleware';
import type { CustomRepositories, N8nRepositories } from './types/repositories';
import { handleErrorResponse } from './utils/errors';
import { createMessageRouter } from './workflow-interaction-layer/message';

/**
 * Builds and mounts custom API routers for external-hooks.
 * This module owns route registration
 */
export function createHookConfig() {
  return {
    n8n: {
      ready: [
        async function (server: { app: any }) {
          console.info(`${LOG_PREFIX} Initializing Custom Endpoints...`);

          const { Container } = require(N8N_DI_PATH);
          const {
            withTransaction,
            UserRepository,
            ProjectRepository,
            ProjectRelationRepository,
            WorkflowRepository,
            SharedWorkflowRepository,
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
          };

          const messageTenantProjectMiddleware = createMessageTenantProjectMiddleware({
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
            messageTenantProjectMiddleware,
            n8nRepositories,
            customRepositories,
          });

          app.use('/rest/custom/admin', adminRouter);
          app.use('/rest/custom/v1', messageRouter);
          app.use(handleErrorResponse);

          console.info(`${LOG_PREFIX} Custom Routes Active.`);
        },
      ],
    },
  };
}
