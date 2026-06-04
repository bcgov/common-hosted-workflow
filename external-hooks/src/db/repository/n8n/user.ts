import type { BaseN8nUserRepository } from '../../../api/types/n8n-adapters';

const API_KEY_AUDIENCE = 'public-api'; // pragma: allowlist secret

export type N8nUser = {
  id: string;
  email: string;
  role: {
    slug: string;
    displayName: string;
  } | null;
};

export class UserRepository {
  constructor(private readonly userRepository: BaseN8nUserRepository) {}

  get metadata() {
    return this.userRepository.metadata;
  }

  async findByEmail(email: string, relations?: string[]) {
    return await this.userRepository.findOne({ where: { email }, relations });
  }

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
