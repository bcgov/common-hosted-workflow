import type { Express } from 'express';
import { CUSTOM_DATABASE_URL, EXTERNAL_UI_PATH, EXTERNAL_UI_ENABLED } from '@config';
import { mountAssets } from './bootstrap/assets';
import { buildCustomRepositories } from './bootstrap/custom-repositories';
import { mountCustomApi } from './bootstrap/custom-api';
import {
  applyGoldDrFrontendSettings,
  applyOidcFrontendSettings,
  type FrontendSettings,
} from './bootstrap/frontend-settings';
import { blockN8nEditRoutes } from './bootstrap/golddr-n8n-routes';
import { createGoldDrEditGuard } from './helpers/golddr-edit-guard';
import { extractCredentialIds, getWorkflowNodes } from './helpers/workflow';
import { buildN8nRuntimeContext, type N8nRepositories } from './bootstrap/n8n-repositories';
import { mountOidc } from './bootstrap/oidc';
import { buildRouteContext } from './bootstrap/route-context';
import { buildApiServices, buildN8nServices } from './bootstrap/services';
import { mountUi } from './bootstrap/ui';
import type { IWorkflowBase } from './types/hooks';
import type { UiApiServiceContract } from './types/services';
import { handleErrorResponse } from './utils/errors';
import { createLogger } from './utils/logger';

const log = createLogger('CustomAPIs');

function createHookConfig() {
  let n8nRepositories: N8nRepositories | null = null;
  let uiApiService: UiApiServiceContract | null = null;
  // Allows activation so DR-safe workflows can continue running.
  const blockEditsOnGoldDr = createGoldDrEditGuard();

  return {
    n8n: {
      ready: [
        async function (this: Record<string, unknown>, server: { app: Express }) {
          log.info('Initializing Custom Endpoints...');

          if (!CUSTOM_DATABASE_URL) {
            throw new Error('CUSTOM_DATABASE_URL is not set');
          }

          const { app } = server;
          const n8nRuntime = buildN8nRuntimeContext();
          n8nRepositories = n8nRuntime.n8nRepositories;

          const n8nServices = buildN8nServices(n8nRuntime.container);
          const customRepositories = buildCustomRepositories(CUSTOM_DATABASE_URL);
          const services = await buildApiServices(
            n8nRuntime.n8nRepositories,
            customRepositories,
            n8nServices,
            n8nRuntime.globalOwnerRoleSlug,
          );
          uiApiService = services.uiApi;

          const routeContext = buildRouteContext({
            services,
            n8nRepositories: n8nRuntime.n8nRepositories,
            customRepositories,
            globalOwnerRoleSlug: n8nRuntime.globalOwnerRoleSlug,
            globalAdminRoleSlug: n8nRuntime.globalAdminRoleSlug,
          });

          mountCustomApi(app, routeContext);
          mountUi(app, routeContext, EXTERNAL_UI_PATH, EXTERNAL_UI_ENABLED);
          mountOidc({
            app,
            n8nRepositories: n8nRuntime.n8nRepositories,
            customRepositories,
            authService: n8nServices.authService,
            jwtService: n8nServices.jwtService,
            userService: n8nServices.userService,
            tenantProjectSyncService: services.tenantProjectSync,
            tenantService: services.tenant,
            cstarService: services.cstar,
          });
          mountAssets(app);
          blockN8nEditRoutes(app);

          app.use(handleErrorResponse);
          log.info('Custom Routes Active.');
        },
      ],
    },
    frontend: {
      /**
       * Modify frontend settings to configure SSO display, and to turn off editor autosave on GoldDR
       */
      settings: [
        async function (frontendSettings: FrontendSettings) {
          applyOidcFrontendSettings(frontendSettings);
          applyGoldDrFrontendSettings(frontendSettings);
        },
      ],
    },
    credentials: {
      create: [blockEditsOnGoldDr],
      update: [blockEditsOnGoldDr],
      delete: [blockEditsOnGoldDr],
    },
    workflow: {
      create: [blockEditsOnGoldDr],
      update: [blockEditsOnGoldDr],
      delete: [blockEditsOnGoldDr],
      afterUpdate: [
        async function (updatedWorkflow: IWorkflowBase) {
          if (!n8nRepositories || !uiApiService) {
            log.warn('Workflow afterUpdate: services not initialized');
            return;
          }

          try {
            const credentialIds = extractCredentialIds(getWorkflowNodes(updatedWorkflow));
            if (!credentialIds.length) return;

            const projectIds = await n8nRepositories.sharedWorkflow.findProjectIds(updatedWorkflow.id);
            if (!projectIds.length) return;

            await Promise.all(
              projectIds.map((projectId) => uiApiService!.ensureCredentialsSharedWithProject(credentialIds, projectId)),
            );
          } catch (error) {
            log.error('Failed to sync credentials after workflow update', {
              workflowId: updatedWorkflow.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      ],
    },
  };
}

/** n8n external-hooks entry: CommonJS export for the hook runtime. */
export = createHookConfig();
