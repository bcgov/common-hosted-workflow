import type { Express } from 'express';
import { CUSTOM_DATABASE_URL, EXTERNAL_UI_PATH, EXTERNAL_UI_ENABLED } from '@config';
import { mountAssets } from './bootstrap/assets';
import { buildCustomRepositories } from './bootstrap/custom-repositories';
import { mountCustomApi } from './bootstrap/custom-api';
import { applyOidcFrontendSettings, type FrontendSettings } from './bootstrap/frontend-settings';
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
          const services = buildApiServices(n8nRuntime.n8nRepositories, customRepositories, n8nServices);
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
            authService: n8nServices.authService,
            jwtService: n8nServices.jwtService,
            userService: n8nServices.userService,
          });
          mountAssets(app);

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
        async function (frontendSettings: FrontendSettings) {
          applyOidcFrontendSettings(frontendSettings);
        },
      ],
    },
    workflow: {
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
