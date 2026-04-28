import type { ApiKeyLookupService } from '../types/services';
import type { User } from '../types/user';

const API_KEY_AUDIENCE = 'public-api'; // pragma: allowlist secret

type UserRepository = {
  findOne: (options: {
    where: {
      apiKeys: {
        apiKey: string;
        audience: string;
      };
    };
    relations: string[];
  }) => Promise<User | null>;
};

export class ApiKeyService implements ApiKeyLookupService {
  constructor(private readonly userRepository: UserRepository) {}

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
