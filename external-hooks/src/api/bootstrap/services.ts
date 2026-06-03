import { ApiKeyService } from '../services/api-key';
import { UiApiService } from '../services/ui-api';
import { ActionService } from '../services/action.service';
import { MessageService } from '../services/message.service';
import type { ApiServices } from '../types/services';
import type { N8nRepositories, CustomRepositories } from '../types/repositories';

export function buildApiServices(
  n8nRepositories: N8nRepositories,
  customRepositories: CustomRepositories,
): ApiServices {
  const sharedDeps = {
    executionRepository: n8nRepositories.execution,
    sharedWorkflowRepository: n8nRepositories.sharedWorkflow,
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
