import { getColumnName, quoteIdentifier } from './sql';
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

  /**
   * Returns the n8n project IDs the given credential is shared with. Used to
   * authorize that a credential referenced by ID belongs to a project within
   * the caller's allowed scope before it is decrypted.
   */
  async findProjectIds(credentialId: string): Promise<string[]> {
    const metadata = this.sharedCredentialRepository.metadata;
    const table = quoteIdentifier(metadata.tableName);
    const credentialColumn = quoteIdentifier(getColumnName(metadata, 'credentialsId'));
    const projectColumn = quoteIdentifier(getColumnName(metadata, 'projectId'));

    const rows = await this.sharedCredentialRepository.manager.query(
      `
        SELECT sc.${projectColumn} AS "projectId"
        FROM ${table} sc
        WHERE sc.${credentialColumn} = $1
      `,
      [credentialId],
    );

    return rows.map((row) => String(row.projectId));
  }
}
