import type {
  BaseN8nCredentialRepository,
  EntityMetadataLike,
  N8nCredentialRecord,
} from '../../../api/types/n8n-adapters';
import { getColumnName, quoteIdentifier } from './sql';

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

  /**
   * Credentials of `type` that are shared with at least one of `projectIds`.
   * Returns the encrypted row only — callers decrypt and drop secrets.
   */
  async listByTypeSharedWithProjects(
    type: string,
    projectIds: string[],
    sharedMetadata: EntityMetadataLike,
  ): Promise<N8nCredentialRecord[]> {
    if (projectIds.length === 0) return [];

    const credentialTable = quoteIdentifier(this.metadata.tableName);
    const sharedTable = quoteIdentifier(sharedMetadata.tableName);
    const idColumn = quoteIdentifier(getColumnName(this.metadata, 'id'));
    const nameColumn = quoteIdentifier(getColumnName(this.metadata, 'name'));
    const typeColumn = quoteIdentifier(getColumnName(this.metadata, 'type'));
    const dataColumn = quoteIdentifier(getColumnName(this.metadata, 'data'));
    const sharedCredentialColumn = quoteIdentifier(getColumnName(sharedMetadata, 'credentialsId'));
    const sharedProjectColumn = quoteIdentifier(getColumnName(sharedMetadata, 'projectId'));

    const rows = await this.credentialRepository.manager.query(
      `
        SELECT DISTINCT
          c.${idColumn} AS "id",
          c.${nameColumn} AS "name",
          c.${typeColumn} AS "type",
          c.${dataColumn} AS "data"
        FROM ${credentialTable} c
        INNER JOIN ${sharedTable} sc ON sc.${sharedCredentialColumn} = c.${idColumn}
        WHERE c.${typeColumn} = $1
          AND sc.${sharedProjectColumn} = ANY($2)
        ORDER BY c.${nameColumn} ASC
      `,
      [type, projectIds],
    );

    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      type: String(row.type),
      data: String(row.data),
    }));
  }
}
