import type { N8nCredentialRepository } from '../../../api/types/n8n-adapters';

export class CredentialRepository {
  constructor(private readonly credentialRepository: N8nCredentialRepository) {}

  get metadata() {
    return this.credentialRepository.metadata;
  }

  async findOneBy(where: { id: string }) {
    return await this.credentialRepository.findOneBy(where);
  }
}
