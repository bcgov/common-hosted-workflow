import { ApiKeyService } from '../services/api-key';
import { UiApiService } from '../services/ui-api';
import { ActionService } from '../services/action.service';
import { MessageService } from '../services/message.service';
import type { N8nRepositoryService } from '../services/n8n-repository';
import type { CustomRepositoryService } from '../services/custom-repository';
import type { ApiServices } from '../types/services';

export function buildApiServices(
  repositoryService: N8nRepositoryService,
  customRepositoryService: CustomRepositoryService,
): ApiServices {
  const sharedDeps = {
    executionRepository: repositoryService.raw.execution,
    sharedWorkflowRepository: repositoryService.raw.sharedWorkflow,
  };

  return {
    apiKey: new ApiKeyService(repositoryService.raw.user),
    uiApi: new UiApiService(repositoryService),
    action: new ActionService({
      actionRequestRepository: customRepositoryService.actionRequest,
      ...sharedDeps,
    }),
    message: new MessageService({
      messageRepository: customRepositoryService.message,
      ...sharedDeps,
    }),
  };
}
