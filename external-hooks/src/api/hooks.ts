import { Router, type Express, type Request, type Response, static as serveStatic } from 'express';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ActionRequestRepository } from '../db/repository/workflow-interaction-layer/action-request';
import { MessageRepository } from '../db/repository/workflow-interaction-layer/message';
import { TenantProjectRelationRepository } from '../db/repository/workflow-interaction-layer/tenant-project-relation';
import { ApiKeyService } from './services/api-key';
import { UiApiService } from './services/ui-api';
import { N8N_DB_PATH, N8N_DI_PATH, N8N_JWT_SERVICE_PATH, N8N_USER_SERVICE_PATH } from './constants/n8n-paths';
import { createAuthMiddleware, createWorkflowInteractionTenantMiddleware } from './middlewares';
import { buildActionRouter } from './routes/actions';
import { buildActorRouter } from './routes/actors';
import { buildAdminRouter } from './routes/admin';
import { buildMessageRouter } from './routes/messages';
import {
  buildOidcRouter,
  type N8nOidcDbCollections,
  type N8nOidcJwtService,
  type N8nOidcUserService,
} from './routes/oidc';
import { buildUiApiRouter } from './routes/ui-api';
import type { CustomRepositories, N8nRepositories } from './types/repositories';
import type { ApiRouteContext } from './types/routes';
import type { ApiServices } from './types/services';
import { handleErrorResponse } from './utils/errors';
import { createLogger } from './utils/logger';
import { mountSwaggerUi } from './swagger-ui';
import { getN8nOidcConfigFromEnv, validateN8nOidcConfig } from './helpers/n8n-oidc';

const log = createLogger('CustomAPIs');
const assetsPath = process.env.EXTERNAL_HOOK_ASSETS_PATH || 'api/assets';

function createHookConfig() {
  return {
    n8n: {
      ready: [
        async function (this: { dbCollections: N8nOidcDbCollections }, server: { app: Express }) {
          log.info('Initializing Custom Endpoints...');

          const { Container } = require(N8N_DI_PATH);
          const {
            withTransaction,
            UserRepository,
            ProjectRepository,
            ProjectRelationRepository,
            WorkflowRepository,
            SharedWorkflowRepository,
            CredentialsRepository,
            SharedCredentialsRepository,
            ExecutionRepository,
            GLOBAL_OWNER_ROLE,
            GLOBAL_ADMIN_ROLE,
          } = require(N8N_DB_PATH);

          const n8nRepositories: N8nRepositories = {
            user: Container.get(UserRepository),
            project: Container.get(ProjectRepository),
            projectRelation: Container.get(ProjectRelationRepository),
            workflow: Container.get(WorkflowRepository),
            sharedWorkflow: Container.get(SharedWorkflowRepository),
            credential: Container.get(CredentialsRepository),
            sharedCredential: Container.get(SharedCredentialsRepository),
            withTransaction,
            execution: Container.get(ExecutionRepository),
          };

          const services: ApiServices = {
            apiKey: new ApiKeyService(n8nRepositories.user),
            uiApi: new UiApiService(n8nRepositories),
          };

          const { apiKeyAuthMiddleware, adminAuthMiddleware } = createAuthMiddleware({
            services,
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

          const routeContext: ApiRouteContext = {
            apiKeyAuthMiddleware,
            adminAuthMiddleware,
            workflowInteractionTenantMiddleware,
            n8nRepositories,
            customRepositories,
            services,
          };

          const v1Router = Router();

          v1Router.use('/admin', buildAdminRouter(routeContext));
          v1Router.use(buildActorRouter(routeContext));
          v1Router.use(buildMessageRouter(routeContext));
          v1Router.use(buildActionRouter(routeContext));

          mountSwaggerUi(app);

          app.use('/rest/custom/v1', v1Router);

          const uiPath = process.env.EXTERNAL_UI_PATH;
          const externalUiEnabled = process.env.EXTERNAL_UI_ENABLED === 'true';
          if (uiPath && externalUiEnabled) {
            const indexPath = path.resolve(uiPath, 'index.html');

            app.use('/ui', serveStatic(uiPath, { index: 'index.html' }));
            app.get(/^\/ui\/.*$/, (req: Request, res: Response) => {
              res.sendFile(indexPath, (err) => {
                if (err) {
                  res.status(404).send('UI asset not found');
                }
              });
            });

            app.use('/ui-api', buildUiApiRouter(routeContext));
          }

          const oidcConfig = getN8nOidcConfigFromEnv();
          const missingOidcConfig = validateN8nOidcConfig(oidcConfig);
          if (missingOidcConfig.length === 0) {
            const { JwtService } = require(N8N_JWT_SERVICE_PATH);
            const { UserService } = require(N8N_USER_SERVICE_PATH);
            const jwtService = Container.get(JwtService) as N8nOidcJwtService;
            const userService = Container.get(UserService) as N8nOidcUserService;

            app.use(
              '/rest/auth/oidc',
              buildOidcRouter({
                dbCollections: this.dbCollections,
                jwtService,
                userService,
                config: oidcConfig,
              }),
            );
          } else {
            log.warn('Missing configuration — OIDC disabled', { missing: missingOidcConfig.join(', ') });
          }

          app.use(
            '/assets',
            serveStatic(assetsPath, {
              index: false,
              maxAge: '1h',
              setHeaders(res) {
                res.setHeader('Cache-Control', 'public, max-age=3600');
              },
            }),
          );

          app.use(handleErrorResponse);
          log.info('Custom Routes Active.');
        },
      ],
    },
    frontend: {
      /**
       * Modify frontend settings to configure SSO display
       */
      settings: [
        async function (frontendSettings) {
          const config = getN8nOidcConfigFromEnv();
          const missing = validateN8nOidcConfig(config);
          if (missing.length > 0) {
            return; // OIDC not configured, don't modify settings
          }

          // Enable OIDC login button by setting these properties
          // This tells the frontend that OIDC is available
          frontendSettings.sso = frontendSettings.sso || {};
          frontendSettings.sso.oidc = {
            loginEnabled: true,
            loginUrl: '/rest/auth/oidc/login',
            callbackUrl: config.redirectUri,
          };

          // Set authentication method to OIDC so the frontend knows SSO is primary
          frontendSettings.userManagement = frontendSettings.userManagement || {};
          frontendSettings.userManagement.authenticationMethod = 'oidc';

          // Enable enterprise OIDC feature flag so the SSO button shows
          frontendSettings.enterprise = frontendSettings.enterprise || {};
          frontendSettings.enterprise.oidc = true;

          log.info('Frontend settings configured for OIDC');
        },
      ],
    },
  };
}

/** n8n external-hooks entry: CommonJS export for the hook runtime. */
export = createHookConfig();
