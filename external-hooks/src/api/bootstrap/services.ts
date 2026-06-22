import { AccessRequestService } from '../services/access-request';
import { ActionService } from '../services/action.service';
import { ChefsService } from '../services/chefs.service';
import { CstarService } from '../services/cstar.service';
import { MessageService } from '../services/message.service';
import { TenantService } from '../services/tenant.service';
import { TenantProjectSyncService } from '../services/tenant-project-sync.service';
import { UiApiService } from '../services/ui-api';
import { N8N_JWT_SERVICE_PATH, N8N_NODE_MAILER_PATH, N8N_USER_SERVICE_PATH } from '../constants/n8n-paths';
import type { N8nRepositories, N8nContainer } from './n8n-repositories';
import type { CustomRepositories } from './custom-repositories';
import type { ApiServices } from '../types/services';
import { getCssSsoConfig } from '../helpers/css-sso-config';
import { CssSsoService } from '../services/css-sso';
import { JwtService, type BaseJwtService } from '../services/jwt';
import { NodeMailerService, type BaseNodeMailerService } from '../services/node-mailer';
import { UserService, type BaseUserService } from '../services/user';
import { createLogger } from '../utils/logger';

const log = createLogger('Services');

export type N8nServices = {
  jwtService: JwtService;
  nodeMailerService: NodeMailerService;
  userService: UserService;
};

export function buildN8nServices(container: N8nContainer): N8nServices {
  const { JwtService: BaseJwtServiceClass } = require(N8N_JWT_SERVICE_PATH) as { JwtService: unknown };
  const { NodeMailer: BaseNodeMailerServiceClass } = require(N8N_NODE_MAILER_PATH) as { NodeMailer: unknown };
  const { UserService: BaseUserServiceClass } = require(N8N_USER_SERVICE_PATH) as { UserService: unknown };

  return {
    jwtService: new JwtService(container.get<BaseJwtService>(BaseJwtServiceClass)),
    nodeMailerService: new NodeMailerService(container.get<BaseNodeMailerService>(BaseNodeMailerServiceClass)),
    userService: new UserService(container.get<BaseUserService>(BaseUserServiceClass)),
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

  // Resolve global owner user ID for tenant project creation
  const globalOwnerUserId = await resolveGlobalOwnerUserId(n8nRepositories, globalOwnerRoleSlug);
  log.debug('Resolved global owner for tenant project sync', { globalOwnerUserId, globalOwnerRoleSlug });

  return {
    uiApi: new UiApiService(n8nRepositories),
    action: new ActionService(n8nRepositories, customRepositories),
    chefs: new ChefsService(),
    cstar: cstarService,
    message: new MessageService(n8nRepositories, customRepositories),
    accessRequest: new AccessRequestService(
      n8nRepositories,
      customRepositories,
      n8nServices.userService,
      cssSsoService,
      n8nServices.nodeMailerService,
    ),
    tenant: new TenantService(customRepositories, n8nRepositories, cstarService),
    tenantProjectSync: new TenantProjectSyncService(
      n8nRepositories,
      customRepositories,
      cstarService,
      globalOwnerUserId,
    ),
  };
}

async function resolveGlobalOwnerUserId(
  n8nRepositories: N8nRepositories,
  globalOwnerRoleSlug: string,
): Promise<string> {
  const rows = await n8nRepositories.raw.user.manager.query(`SELECT "id" FROM "user" WHERE "roleSlug" = $1 LIMIT 1`, [
    globalOwnerRoleSlug,
  ]);
  if (rows.length === 0) {
    log.warn('No global owner user found — tenant project sync will be skipped until an owner exists');
    return '';
  }
  return rows[0].id as string;
}
