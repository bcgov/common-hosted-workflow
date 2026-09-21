import { AccessRequestService } from '../services/access-request';
import { ActionService } from '../services/action.service';
import { ClaimService } from '../services/claim.service';
import { TriggerService } from '../services/trigger.service';
import { AuthService, type BaseAuthService } from '../services/auth';
import { ChefsService } from '../services/chefs.service';
import { CstarService } from '../services/cstar.service';
import { FeatureFlagService } from '../services/feature-flag.service';
import { MessageService } from '../services/message.service';
import { MultiWebhookWaitService } from '../services/multi-webhook-wait.service';
import { ProjectTenantService } from '../services/project-tenant.service';
import { TenantService } from '../services/tenant.service';
import { TenantProjectSyncService } from '../services/tenant-project-sync.service';
import { UiApiService } from '../services/ui-api';
import {
  N8N_AUTH_SERVICE_PATH,
  N8N_CORE_PATH,
  N8N_JWT_SERVICE_PATH,
  N8N_NODE_MAILER_PATH,
  N8N_USER_SERVICE_PATH,
} from '../constants/n8n-paths';
import { CredentialDecryptService } from '../services/credential-decrypt.service';
import type { N8nRepositories, N8nContainer } from './n8n-repositories';
import type { CustomRepositories } from './custom-repositories';
import type { ApiServices } from '../types/services';
import { getCssSsoConfig } from '../helpers/css-sso-config';
import { CssSsoService } from '../services/css-sso';
import { JwtService, type BaseJwtService } from '../services/jwt';
import { NodeMailerService, type BaseNodeMailerService } from '../services/node-mailer';
import { UserService, type BaseUserService } from '../services/user';

export type N8nServices = {
  authService: AuthService;
  jwtService: JwtService;
  nodeMailerService: NodeMailerService;
  userService: UserService;
  credentialDecrypt: CredentialDecryptService;
};

export function buildN8nServices(container: N8nContainer): N8nServices {
  const { AuthService: BaseAuthServiceClass } = require(N8N_AUTH_SERVICE_PATH) as { AuthService: unknown };
  const { JwtService: BaseJwtServiceClass } = require(N8N_JWT_SERVICE_PATH) as { JwtService: unknown };
  const { NodeMailer: BaseNodeMailerServiceClass } = require(N8N_NODE_MAILER_PATH) as { NodeMailer: unknown };
  const { UserService: BaseUserServiceClass } = require(N8N_USER_SERVICE_PATH) as { UserService: unknown };
  // n8n's `Credentials` class decrypts credential data via the DI-injected Cipher.
  const { Credentials: N8nCredentialsClass } = require(N8N_CORE_PATH) as { Credentials: unknown };

  return {
    authService: new AuthService(container.get<BaseAuthService>(BaseAuthServiceClass)),
    jwtService: new JwtService(container.get<BaseJwtService>(BaseJwtServiceClass)),
    nodeMailerService: new NodeMailerService(container.get<BaseNodeMailerService>(BaseNodeMailerServiceClass)),
    userService: new UserService(container.get<BaseUserService>(BaseUserServiceClass)),
    credentialDecrypt: new CredentialDecryptService(
      N8nCredentialsClass as ConstructorParameters<typeof CredentialDecryptService>[0],
    ),
  };
}

export async function buildApiServices(
  n8nRepositories: N8nRepositories,
  customRepositories: CustomRepositories,
  n8nServices: N8nServices,
  globalOwnerRoleSlug: string,
): Promise<ApiServices> {
  const cssSsoConfig = getCssSsoConfig();
  const cssSsoService = cssSsoConfig ? new CssSsoService(cssSsoConfig) : null;
  const cstarService = new CstarService();
  const featureFlag = new FeatureFlagService();
  const tenantService = new TenantService(customRepositories, n8nRepositories, cstarService);

  return {
    uiApi: new UiApiService(n8nRepositories),
    action: new ActionService(n8nRepositories, customRepositories),
    claim: new ClaimService(customRepositories.actionRequest),
    trigger: new TriggerService(customRepositories),
    chefs: new ChefsService(n8nRepositories, n8nServices.credentialDecrypt),
    cstar: cstarService,
    featureFlag,
    message: new MessageService(n8nRepositories, customRepositories),
    accessRequest: new AccessRequestService(
      n8nRepositories,
      customRepositories,
      n8nServices.userService,
      cssSsoService,
      n8nServices.nodeMailerService,
    ),
    tenant: tenantService,
    tenantProjectSync: new TenantProjectSyncService(
      n8nRepositories,
      customRepositories,
      cstarService,
      featureFlag,
      globalOwnerRoleSlug,
    ),
    projectTenant: new ProjectTenantService(n8nRepositories, customRepositories, tenantService, cstarService),
    multiWebhookWait: new MultiWebhookWaitService(customRepositories),
  };
}
