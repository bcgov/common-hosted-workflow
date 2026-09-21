import type { BaseN8nCredentialRepository, N8nCredentialRecord } from '../../../api/types/n8n-adapters';

export class CredentialRepository {
  constructor(private readonly credentialRepository: BaseN8nCredentialRepository) {}

  get metadata() {
    return this.credentialRepository.metadata;
  }

  async findOneBy(where: { id: string }): Promise<N8nCredentialRecord | null> {
    return await this.credentialRepository.findOneBy(where);
  }
}
