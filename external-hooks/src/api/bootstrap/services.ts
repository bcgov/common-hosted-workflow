import { AccessRequestService } from '../services/access-request';
import { ActionService } from '../services/action.service';
import { ChefsService } from '../services/chefs.service';
import { MessageService } from '../services/message.service';
import { TenantService } from '../services/tenant.service';
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

export function buildApiServices(
  n8nRepositories: N8nRepositories,
  customRepositories: CustomRepositories,
  n8nServices: N8nServices,
): ApiServices {
  const cssSsoConfig = getCssSsoConfig();
  const cssSsoService = cssSsoConfig ? new CssSsoService(cssSsoConfig) : null;

  return {
    uiApi: new UiApiService(n8nRepositories),
    action: new ActionService(n8nRepositories, customRepositories),
    chefs: new ChefsService(),
    message: new MessageService(n8nRepositories, customRepositories),
    accessRequest: new AccessRequestService(
      n8nRepositories,
      customRepositories,
      n8nServices.userService,
      cssSsoService,
      n8nServices.nodeMailerService,
    ),
    tenant: new TenantService(customRepositories),
  };
}
