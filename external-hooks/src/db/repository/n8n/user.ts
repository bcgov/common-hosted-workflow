import type { BaseN8nUserRepository, QueryBuilderLike } from '../../../api/types/n8n-adapters';
import type { N8nUser } from '../../../api/types/user';

const API_KEY_AUDIENCE = 'public-api'; // pragma: allowlist secret

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

  async count(): Promise<number> {
    return await this.userRepository.count();
  }

  createQueryBuilder(alias: string): QueryBuilderLike {
    return this.userRepository.createQueryBuilder(alias);
  }

  async setUserDisabled(userId: string, disabled: boolean): Promise<void> {
    await this.userRepository.manager.query('UPDATE "user" SET "disabled" = $1 WHERE "id" = $2', [disabled, userId]);
  }

  async createUserWithProject(userData: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    disabled?: boolean;
    role?: { slug: string };
  }): Promise<{ user: N8nUser }> {
    return await this.userRepository.createUserWithProject(userData);
  }
}
