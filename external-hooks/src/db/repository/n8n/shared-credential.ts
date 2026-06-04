import type { BaseN8nSharedCredentialRepository } from '../../../api/types/n8n-adapters';

export class SharedCredentialRepository {
  constructor(private readonly sharedCredentialRepository: BaseN8nSharedCredentialRepository) {}

  get metadata() {
    return this.sharedCredentialRepository.metadata;
  }
}
