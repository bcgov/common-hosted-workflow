import { ApiKeyService } from '../services/api-key';
import { UiApiService } from '../services/ui-api';
import { ActionService } from '../services/action.service';
import { MessageService } from '../services/message.service';
import type { N8nRepositories } from './n8n-repositories';
import type { CustomRepositories } from './custom-repositories';
import type { ApiServices } from '../types/services';

export function buildApiServices(
  n8nRepositories: N8nRepositories,
  customRepositories: CustomRepositoryObject,
): ApiServices {
  const sharedDeps = {
    executionRepository: n8nRepositories.raw.execution,
    sharedWorkflowRepository: n8nRepositories.raw.sharedWorkflow,
  };

  return {
    apiKey: new ApiKeyService(n8nRepositories.user),
    uiApi: new UiApiService(n8nRepositories),
    action: new ActionService({
      actionRequestRepository: customRepositories.actionRequest,
      ...sharedDeps,
    }),
    message: new MessageService({
      messageRepository: customRepositories.message,
      ...sharedDeps,
    }),
  };
}
