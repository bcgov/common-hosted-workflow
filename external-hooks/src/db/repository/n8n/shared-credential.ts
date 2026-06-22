import type { BaseN8nSharedCredentialRepository, BaseN8nRepositoryManager } from '../../../api/types/n8n-adapters';

export class SharedCredentialRepository {
  constructor(private readonly sharedCredentialRepository: BaseN8nSharedCredentialRepository) {}

  get metadata() {
    return this.sharedCredentialRepository.metadata;
  }

  get manager(): BaseN8nRepositoryManager {
    return this.sharedCredentialRepository.manager;
  }

  create(value: Record<string, unknown>) {
    return this.sharedCredentialRepository.create(value);
  }

  async save(value: Record<string, unknown>) {
    return await this.sharedCredentialRepository.save(value);
  }
}
