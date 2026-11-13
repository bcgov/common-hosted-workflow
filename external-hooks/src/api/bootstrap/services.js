'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildN8nServices = buildN8nServices;
exports.tryResolveNodeMailerService = tryResolveNodeMailerService;
exports.buildApiServices = buildApiServices;
const access_request_1 = require('../services/access-request');
const action_service_1 = require('../services/action.service');
const claim_service_1 = require('../services/claim.service');
const trigger_service_1 = require('../services/trigger.service');
const trigger_target_service_1 = require('../services/trigger-target.service');
const auth_1 = require('../services/auth');
const chefs_service_1 = require('../services/chefs.service');
const chefs_submission_service_1 = require('../services/chefs-submission.service');
const cstar_service_1 = require('../services/cstar.service');
const feature_flag_service_1 = require('../services/feature-flag.service');
const message_service_1 = require('../services/message.service');
const multi_webhook_wait_service_1 = require('../services/multi-webhook-wait.service');
const project_rate_limit_service_1 = require('../services/project-rate-limit.service');
const project_tenant_service_1 = require('../services/project-tenant.service');
const tenant_service_1 = require('../services/tenant.service');
const tenant_project_sync_service_1 = require('../services/tenant-project-sync.service');
const ui_api_1 = require('../services/ui-api');
const n8n_paths_1 = require('../constants/n8n-paths');
const credential_decrypt_service_1 = require('../services/credential-decrypt.service');
const n8n_credentials_service_1 = require('../services/n8n-credentials.service');
const css_sso_config_1 = require('../helpers/css-sso-config');
const css_sso_1 = require('../services/css-sso');
const jwt_1 = require('../services/jwt');
const node_mailer_1 = require('../services/node-mailer');
const user_1 = require('../services/user');
const logger_1 = require('../utils/logger');
const log = (0, logger_1.createLogger)('ApiServices');
function buildN8nServices(container) {
  const { AuthService: BaseAuthServiceClass } = require(n8n_paths_1.N8N_AUTH_SERVICE_PATH);
  const { JwtService: BaseJwtServiceClass } = require(n8n_paths_1.N8N_JWT_SERVICE_PATH);
  const { NodeMailer: BaseNodeMailerServiceClass } = require(n8n_paths_1.N8N_NODE_MAILER_PATH);
  const { UserService: BaseUserServiceClass } = require(n8n_paths_1.N8N_USER_SERVICE_PATH);
  // n8n's `Credentials` class decrypts credential data via the DI-injected Cipher.
  const { Credentials: N8nCredentialsClass } = require(n8n_paths_1.N8N_CORE_PATH);
  const { CredentialsService: BaseCredentialsServiceClass } = require(n8n_paths_1.N8N_CREDENTIALS_SERVICE_PATH);
  const { CredentialsFinderService: BaseCredentialsFinderServiceClass } = require(
    n8n_paths_1.N8N_CREDENTIALS_FINDER_SERVICE_PATH,
  );
  const { ProjectService: BaseProjectServiceClass } = require(n8n_paths_1.N8N_PROJECT_SERVICE_PATH);
  const { EventService: BaseEventServiceClass } = require(n8n_paths_1.N8N_EVENT_SERVICE_PATH);
  const { CREDENTIAL_BLANKING_VALUE } = require(n8n_paths_1.N8N_WORKFLOW_PATH);
  return {
    authService: new auth_1.AuthService(container.get(BaseAuthServiceClass)),
    jwtService: new jwt_1.JwtService(container.get(BaseJwtServiceClass)),
    nodeMailerService: new node_mailer_1.NodeMailerService(container.get(BaseNodeMailerServiceClass)),
    userService: new user_1.UserService(container.get(BaseUserServiceClass)),
    credentialDecrypt: new credential_decrypt_service_1.CredentialDecryptService(N8nCredentialsClass),
    n8nCredentials: new n8n_credentials_service_1.N8nCredentialsService(
      container.get(BaseCredentialsServiceClass),
      container.get(BaseCredentialsFinderServiceClass),
      container.get(BaseProjectServiceClass),
      container.get(BaseEventServiceClass),
      CREDENTIAL_BLANKING_VALUE,
    ),
  };
}
/**
 * Resolves n8n's mailer from the given DI container, or null when it is
 * unavailable — e.g. a worker process where the mailer service is not
 * registered, or a broken n8n install. Callers treat null as "notifications
 * disabled" and skip sending (the same contract AccessRequestService uses
 * for its optional mailer); a missing mailer must never take enforcement or
 * an API request down.
 */
function tryResolveNodeMailerService(container) {
  try {
    const { NodeMailer: BaseNodeMailerServiceClass } = require(n8n_paths_1.N8N_NODE_MAILER_PATH);
    return new node_mailer_1.NodeMailerService(container.get(BaseNodeMailerServiceClass));
  } catch (error) {
    log.warn('Node mailer unavailable; email notifications are disabled in this process', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
async function buildApiServices(n8nRepositories, customRepositories, n8nServices, globalOwnerRoleSlug, workflowRunner) {
  const cssSsoConfig = (0, css_sso_config_1.getCssSsoConfig)();
  const cssSsoService = cssSsoConfig ? new css_sso_1.CssSsoService(cssSsoConfig) : null;
  const cstarService = new cstar_service_1.CstarService();
  const featureFlag = new feature_flag_service_1.FeatureFlagService();
  const tenantService = new tenant_service_1.TenantService(customRepositories, n8nRepositories, cstarService);
  const chefs = new chefs_service_1.ChefsService(
    n8nRepositories,
    n8nServices.credentialDecrypt,
    n8nServices.n8nCredentials,
  );
  const triggerTarget = new trigger_target_service_1.TriggerTargetService(n8nRepositories, workflowRunner);
  const projectRateLimitService = new project_rate_limit_service_1.ProjectRateLimitService(
    n8nRepositories,
    customRepositories,
    n8nServices.nodeMailerService,
  );
  return {
    uiApi: new ui_api_1.UiApiService(n8nRepositories),
    action: new action_service_1.ActionService(n8nRepositories, customRepositories),
    claim: new claim_service_1.ClaimService(customRepositories.actionRequest),
    trigger: new trigger_service_1.TriggerService(customRepositories, chefs, triggerTarget),
    triggerTarget,
    workflowRunner,
    chefs,
    chefsSubmission: new chefs_submission_service_1.ChefsSubmissionService(customRepositories),
    cstar: cstarService,
    featureFlag,
    message: new message_service_1.MessageService(n8nRepositories, customRepositories),
    accessRequest: new access_request_1.AccessRequestService(
      n8nRepositories,
      customRepositories,
      n8nServices.userService,
      cssSsoService,
      n8nServices.nodeMailerService,
    ),
    tenant: tenantService,
    tenantProjectSync: new tenant_project_sync_service_1.TenantProjectSyncService(
      n8nRepositories,
      customRepositories,
      cstarService,
      featureFlag,
      globalOwnerRoleSlug,
    ),
    projectRateLimit: projectRateLimitService,
    projectTenant: new project_tenant_service_1.ProjectTenantService(
      n8nRepositories,
      customRepositories,
      projectRateLimitService,
    ),
    multiWebhookWait: new multi_webhook_wait_service_1.MultiWebhookWaitService(customRepositories),
  };
}
