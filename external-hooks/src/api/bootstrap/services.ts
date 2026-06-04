import { UiApiService } from '../services/ui-api';
import { ActionService } from '../services/action.service';
import { MessageService } from '../services/message.service';
import type { N8nRepositories } from './n8n-repositories';
import type { CustomRepositories } from './custom-repositories';
import type { ApiServices } from '../types/services';

export function buildApiServices(
  n8nRepositories: N8nRepositories,
  customRepositories: CustomRepositories,
): ApiServices {
  return {
    uiApi: new UiApiService(n8nRepositories),
    action: new ActionService(n8nRepositories, customRepositories),
    message: new MessageService(n8nRepositories, customRepositories),
  };
}
