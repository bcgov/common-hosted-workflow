import { getColumnName, quoteIdentifier, type EntityMetadataLike } from './sql';
export class ProjectRelationRepository {
  constructor(
    private readonly projectRelationRepository: {
      metadata: EntityMetadataLike;
      manager: { query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>> };
    },
    private readonly userRepository: { metadata: EntityMetadataLike },
  ) {}

  get metadata() {
    return this.projectRelationRepository.metadata;
  }

  async listUserEmailsByProjectIds(projectIds: string[]) {
    const projectRelationMetadata = this.projectRelationRepository.metadata;
    const userMetadata = this.userRepository.metadata;

    const projectRelationTable = quoteIdentifier(projectRelationMetadata.tableName);
    const userTable = quoteIdentifier(userMetadata.tableName);

    const projectRelationProjectColumn = quoteIdentifier(getColumnName(projectRelationMetadata, 'projectId'));
    const projectRelationUserColumn = quoteIdentifier(getColumnName(projectRelationMetadata, 'userId'));
    const userIdColumn = quoteIdentifier(getColumnName(userMetadata, 'id'));
    const userEmailColumn = quoteIdentifier(getColumnName(userMetadata, 'email'));

    const rows = await this.projectRelationRepository.manager.query(
      `
        SELECT
          pr.${projectRelationProjectColumn} AS "projectId",
          u.${userEmailColumn} AS "email"
        FROM ${projectRelationTable} pr
        INNER JOIN ${userTable} u ON u.${userIdColumn} = pr.${projectRelationUserColumn}
        WHERE pr.${projectRelationProjectColumn} = ANY($1)
      `,
      [projectIds],
    );

    return rows as Array<{ projectId: string; email: string }>;
  }
}
