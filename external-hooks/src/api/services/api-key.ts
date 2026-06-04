import type { ApiKeyLookupService } from '../types/services';
import type { UserRepository } from '../../db/repository/n8n/user';

export class ApiKeyService implements ApiKeyLookupService {
  constructor(private readonly userRepository: UserRepository) {}

  async getUserForApiKey(apiKey: string) {
    return await this.userRepository.getUserForApiKey(apiKey);
  }
}
