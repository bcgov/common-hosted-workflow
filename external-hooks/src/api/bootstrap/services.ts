import { ApiKeyService } from '../services/api-key';
import { UiApiService } from '../services/ui-api';
import type { ApiServices } from '../types/services';
import type { N8nRepositories } from '../types/repositories';

export function buildApiServices(n8nRepositories: N8nRepositories): ApiServices {
  return {
    apiKey: new ApiKeyService(n8nRepositories.user),
    uiApi: new UiApiService(n8nRepositories),
  };
}
