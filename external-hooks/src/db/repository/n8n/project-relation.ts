import { getColumnName, quoteIdentifier } from './sql';
import type { EntityMetadataLike, BaseN8nProjectRelationRepository } from '../../../api/types/n8n-adapters';

export class ProjectRelationRepository {
  constructor(
    private readonly projectRelationRepository: BaseN8nProjectRelationRepository,
    private readonly userMetadata: EntityMetadataLike,
  ) {}

  get metadata() {
    return this.projectRelationRepository.metadata;
  }

  async findAllByUser(userId: string) {
    return await this.projectRelationRepository.findAllByUser(userId);
  }

  async findProjectRole(args: { userId: string; projectId: string }) {
    // Use find with role relation loaded, since findOneBy doesn't load ManyToOne relations.
    // Cast required because our adapter type doesn't expose `find`, but at runtime this is
    // a full TypeORM Repository with `find` available.
    const repo = this.projectRelationRepository as unknown as {
      find: (options: {
        where: { userId: string; projectId: string };
        relations: { role: boolean };
        take: number;
      }) => Promise<Array<{ role?: unknown }>>;
    };
    const results = await repo.find({
      where: { userId: args.userId, projectId: args.projectId },
      relations: { role: true },
      take: 1,
    });
    return results.length > 0 ? (results[0].role ?? null) : null;
  }

  async save(relation: { projectId: string; userId: string; role: { slug: string } }): Promise<unknown> {
    return await this.projectRelationRepository.save(relation);
  }

  async delete(criteria: { projectId: string; userId: string }): Promise<unknown> {
    return await this.projectRelationRepository.delete(criteria);
  }

  private buildUserEmailLookup() {
    const projectRelationMetadata = this.projectRelationRepository.metadata;
    const userMetadata = this.userMetadata;

    const projectRelationTable = quoteIdentifier(projectRelationMetadata.tableName);
    const userTable = quoteIdentifier(userMetadata.tableName);

    const projectRelationProjectColumn = quoteIdentifier(getColumnName(projectRelationMetadata, 'projectId'));
    const projectRelationUserColumn = quoteIdentifier(getColumnName(projectRelationMetadata, 'userId'));
    const userIdColumn = quoteIdentifier(getColumnName(userMetadata, 'id'));
    const userEmailColumn = quoteIdentifier(getColumnName(userMetadata, 'email'));

    return {
      projectRelationProjectColumn,
      selectSql: `
        SELECT
          pr.${projectRelationProjectColumn} AS "projectId",
          u.${userEmailColumn} AS "email"
        FROM ${projectRelationTable} pr
        INNER JOIN ${userTable} u ON u.${userIdColumn} = pr.${projectRelationUserColumn}
      `,
    };
  }

  private async queryUserEmails(sql: string, params?: unknown[]) {
    return await this.projectRelationRepository.manager.query(sql, params);
  }

  async listUserEmailsByProjectIds(projectIds: string[]): Promise<Array<{ projectId: string; email: string }>> {
    const { projectRelationProjectColumn, selectSql } = this.buildUserEmailLookup();
    const rows = await this.queryUserEmails(`${selectSql} WHERE pr.${projectRelationProjectColumn} = ANY($1)`, [
      projectIds,
    ]);

    return rows as Array<{ projectId: string; email: string }>;
  }
}
