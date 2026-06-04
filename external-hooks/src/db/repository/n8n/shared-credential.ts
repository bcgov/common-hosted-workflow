import type { N8nSharedCredentialRepository } from '../../../api/types/n8n-adapters';

export class SharedCredentialRepository {
  constructor(private readonly sharedCredentialRepository: N8nSharedCredentialRepository) {}

  get metadata() {
    return this.sharedCredentialRepository.metadata;
  }
}
