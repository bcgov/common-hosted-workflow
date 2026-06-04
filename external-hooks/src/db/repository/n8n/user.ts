import type { N8nUserRepository } from '../../../api/types/n8n-adapters';

export type N8nUser = {
  id: string;
  email: string;
  role: {
    slug: string;
    displayName: string;
  } | null;
};

export class UserRepository {
  constructor(private readonly userRepository: N8nUserRepository) {}

  get metadata() {
    return this.userRepository.metadata;
  }

  async findByEmail(email: string, relations?: string[]) {
    return await this.userRepository.findOne({ where: { email }, relations });
  }
}
