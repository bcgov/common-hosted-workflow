import type { ApiKeyLookupService } from '../types/services';
import type { N8nApiKeyUserLookup } from '../types/n8n-adapters';

const API_KEY_AUDIENCE = 'public-api'; // pragma: allowlist secret

export class ApiKeyService implements ApiKeyLookupService {
  constructor(private readonly userRepository: N8nApiKeyUserLookup) {}

  async getUserForApiKey(apiKey: string) {
    return await this.userRepository.findOne({
      where: {
        apiKeys: {
          apiKey,
          audience: API_KEY_AUDIENCE,
        },
      },
      relations: ['role'],
    });
  }
}
