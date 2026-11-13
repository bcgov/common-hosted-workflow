'use strict';
const _config_1 = require('@config');
const assets_1 = require('./bootstrap/assets');
const custom_repositories_1 = require('./bootstrap/custom-repositories');
const custom_api_1 = require('./bootstrap/custom-api');
const frontend_settings_1 = require('./bootstrap/frontend-settings');
const readonly_n8n_routes_1 = require('./bootstrap/readonly-n8n-routes');
const readonly_edit_guard_1 = require('./helpers/readonly-edit-guard');
const rate_limit_hook_1 = require('./bootstrap/rate-limit-hook');
const workflow_1 = require('./helpers/workflow');
const n8n_repositories_1 = require('./bootstrap/n8n-repositories');
const oidc_1 = require('./bootstrap/oidc');
const route_context_1 = require('./bootstrap/route-context');
const services_1 = require('./bootstrap/services');
const n8n_workflow_runner_service_1 = require('./services/n8n-workflow-runner.service');
const ui_1 = require('./bootstrap/ui');
const errors_1 = require('./utils/errors');
const logger_1 = require('./utils/logger');
const log = (0, logger_1.createLogger)('CustomAPIs');
function createHookConfig() {
  let n8nRepositories = null;
  let uiApiService = null;
  // Allows activation so DR-safe workflows can continue running.
  const blockEditsInReadOnlyMode = (0, readonly_edit_guard_1.createReadOnlyEditGuard)();
  return {
    n8n: {
      ready: [
        async function (server) {
          log.info('Initializing Custom Endpoints...');
          if (!_config_1.CUSTOM_DATABASE_URL) {
            throw new Error('CUSTOM_DATABASE_URL is not set');
          }
          const { app } = server;
          const n8nRuntime = (0, n8n_repositories_1.buildN8nRuntimeContext)();
          n8nRepositories = n8nRuntime.n8nRepositories;
          const n8nServices = (0, services_1.buildN8nServices)(n8nRuntime.container);
          const customRepositories = (0, custom_repositories_1.buildCustomRepositories)(_config_1.CUSTOM_DATABASE_URL);
          const workflowRunner = (0, n8n_workflow_runner_service_1.createN8nWorkflowRunnerService)(
            n8nRuntime.container,
            n8nRuntime.n8nRepositories,
          );
          const services = await (0, services_1.buildApiServices)(
            n8nRuntime.n8nRepositories,
            customRepositories,
            n8nServices,
            n8nRuntime.globalOwnerRoleSlug,
            workflowRunner,
          );
          uiApiService = services.uiApi;
          const routeContext = (0, route_context_1.buildRouteContext)({
            services,
            n8nRepositories: n8nRuntime.n8nRepositories,
            customRepositories,
            globalOwnerRoleSlug: n8nRuntime.globalOwnerRoleSlug,
            globalAdminRoleSlug: n8nRuntime.globalAdminRoleSlug,
          });
          (0, custom_api_1.mountCustomApi)(app, routeContext);
          (0, ui_1.mountUi)(app, routeContext, _config_1.EXTERNAL_UI_PATH, _config_1.EXTERNAL_UI_ENABLED);
          (0, oidc_1.mountOidc)({
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
          (0, assets_1.mountAssets)(app);
          (0, readonly_n8n_routes_1.blockN8nEditRoutes)(app);
          app.use(errors_1.handleErrorResponse);
          log.info('Custom Routes Active.');
        },
      ],
    },
    frontend: {
      /**
       * Modify frontend settings to configure SSO display, and to turn off editor autosave in read-only mode
       */
      settings: [
        async function (frontendSettings) {
          (0, frontend_settings_1.applyOidcFrontendSettings)(frontendSettings);
          (0, frontend_settings_1.applyReadOnlyFrontendSettings)(frontendSettings);
        },
      ],
    },
    credentials: {
      create: [blockEditsInReadOnlyMode],
      update: [blockEditsInReadOnlyMode],
      delete: [blockEditsInReadOnlyMode],
    },
    workflow: {
      create: [blockEditsInReadOnlyMode],
      update: [blockEditsInReadOnlyMode],
      delete: [blockEditsInReadOnlyMode],
      /**
       * Per-project execution rate limiting. Fires on every workflow run
       * (main, worker and sub-executions); fails open on infrastructure
       * errors — only RateLimitExceededError aborts the run. See
       * bootstrap/rate-limit-hook.ts for the policy and its tests.
       */
      preExecute: [(0, rate_limit_hook_1.createRateLimitPreExecuteHandler)()],
      afterUpdate: [
        async function (updatedWorkflow) {
          if (!n8nRepositories || !uiApiService) {
            log.warn('Workflow afterUpdate: services not initialized');
            return;
          }
          try {
            const credentialIds = (0, workflow_1.extractCredentialIds)(
              (0, workflow_1.getWorkflowNodes)(updatedWorkflow),
            );
            if (!credentialIds.length) return;
            const projectIds = await n8nRepositories.sharedWorkflow.findProjectIds(updatedWorkflow.id);
            if (!projectIds.length) return;
            await Promise.all(
              projectIds.map((projectId) => uiApiService.ensureCredentialsSharedWithProject(credentialIds, projectId)),
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
module.exports = createHookConfig();
