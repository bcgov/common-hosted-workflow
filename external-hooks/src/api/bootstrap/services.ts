import { AccessRequestService } from '../services/access-request';
import { ActionService } from '../services/action.service';
import { MessageService } from '../services/message.service';
import { TenantService } from '../services/tenant.service';
import { UiApiService } from '../services/ui-api';
import type { N8nRepositories } from './n8n-repositories';
import type { CustomRepositories } from './custom-repositories';
import type { ApiServices } from '../types/services';
import type { N8nUserRoleService } from '../types/n8n-services';
import { getCssSsoConfig } from '../helpers/css-sso-config';

export function buildApiServices(
  n8nRepositories: N8nRepositories,
  customRepositories: CustomRepositories,
  userRoleService: N8nUserRoleService,
): ApiServices {
  const cssSsoConfig = getCssSsoConfig();

  return {
    uiApi: new UiApiService(n8nRepositories),
    action: new ActionService(n8nRepositories, customRepositories),
    message: new MessageService(n8nRepositories, customRepositories),
    accessRequest: new AccessRequestService(n8nRepositories, customRepositories, userRoleService, cssSsoConfig),
    tenant: new TenantService(customRepositories),
  };
}
