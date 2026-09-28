import type { BaseN8nCredentialRepository, N8nCredentialRecord } from '../../../api/types/n8n-adapters';

export class CredentialRepository {
  constructor(private readonly credentialRepository: BaseN8nCredentialRepository) {}

  get metadata() {
    return this.credentialRepository.metadata;
  }

  async findOneBy(where: { id: string }): Promise<N8nCredentialRecord | null> {
    return await this.credentialRepository.findOneBy(where);
  }

  create(value: Record<string, unknown>): N8nCredentialRecord {
    return this.credentialRepository.create(value);
  }

  async save(value: N8nCredentialRecord): Promise<N8nCredentialRecord> {
    return await this.credentialRepository.save(value);
  }
}
