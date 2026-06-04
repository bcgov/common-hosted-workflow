import { getColumnName, quoteIdentifier } from './sql';
import type { EntityMetadataLike, BaseN8nSharedWorkflowRepository } from '../../../api/types/n8n-adapters';

export type SharedWorkflowRow = {
  workflowId: string;
  workflowName: string;
  projectId: string;
};

type SharedWorkflowQueryResult = Array<Record<string, unknown>>;

export class SharedWorkflowRepository {
  constructor(
    private readonly sharedWorkflowRepository: BaseN8nSharedWorkflowRepository,
    private readonly workflowMetadata: EntityMetadataLike,
  ) {}

  get metadata() {
    return this.sharedWorkflowRepository.metadata;
  }

  get manager() {
    return this.sharedWorkflowRepository.manager;
  }

  create(value: Record<string, unknown>) {
    return this.sharedWorkflowRepository.create(value);
  }

  async save(value: Record<string, unknown>) {
    return await this.sharedWorkflowRepository.save(value);
  }

  async delete(criteria: Record<string, unknown>) {
    return await this.sharedWorkflowRepository.delete(criteria);
  }

  private buildWorkflowRowSelect() {
    const sharedWorkflowMetadata = this.sharedWorkflowRepository.metadata;
    const workflowMetadata = this.workflowMetadata;

    const sharedWorkflowTable = quoteIdentifier(sharedWorkflowMetadata.tableName);
    const workflowTable = quoteIdentifier(workflowMetadata.tableName);

    const sharedWorkflowProjectColumn = quoteIdentifier(getColumnName(sharedWorkflowMetadata, 'projectId'));
    const sharedWorkflowWorkflowColumn = quoteIdentifier(getColumnName(sharedWorkflowMetadata, 'workflowId'));
    const workflowIdColumn = quoteIdentifier(getColumnName(workflowMetadata, 'id'));
    const workflowNameColumn = quoteIdentifier(getColumnName(workflowMetadata, 'name'));

    return {
      sharedWorkflowProjectColumn,
      sharedWorkflowWorkflowColumn,
      selectSql: `
        SELECT
          sw.${sharedWorkflowWorkflowColumn} AS "workflowId",
          w.${workflowNameColumn} AS "workflowName",
          sw.${sharedWorkflowProjectColumn} AS "projectId"
        FROM ${sharedWorkflowTable} sw
        INNER JOIN ${workflowTable} w ON w.${workflowIdColumn} = sw.${sharedWorkflowWorkflowColumn}
      `,
    };
  }

  private async queryWorkflowRows(sql: string, params?: unknown[]): Promise<SharedWorkflowQueryResult> {
    return await this.sharedWorkflowRepository.manager.query(sql, params);
  }

  async findProjectIds(workflowId: string) {
    const sharedWorkflowMetadata = this.sharedWorkflowRepository.metadata;
    const sharedWorkflowTable = quoteIdentifier(sharedWorkflowMetadata.tableName);
    const sharedWorkflowWorkflowColumn = quoteIdentifier(getColumnName(sharedWorkflowMetadata, 'workflowId'));
    const sharedWorkflowProjectColumn = quoteIdentifier(getColumnName(sharedWorkflowMetadata, 'projectId'));

    const rows = await this.queryWorkflowRows(
      `
        SELECT sw.${sharedWorkflowProjectColumn} AS "projectId"
        FROM ${sharedWorkflowTable} sw
        WHERE sw.${sharedWorkflowWorkflowColumn} = $1
      `,
      [workflowId],
    );

    return rows.map((row) => String(row.projectId));
  }

  async findRowsByWorkflowId(workflowId: string): Promise<SharedWorkflowRow[]> {
    const { sharedWorkflowWorkflowColumn, selectSql } = this.buildWorkflowRowSelect();
    const rows = await this.queryWorkflowRows(`${selectSql} WHERE sw.${sharedWorkflowWorkflowColumn} = $1`, [
      workflowId,
    ]);

    return rows as SharedWorkflowRow[];
  }

  async findWorkflowRowsByProjectIds(projectIds?: string[]): Promise<SharedWorkflowRow[]> {
    const { sharedWorkflowProjectColumn, selectSql } = this.buildWorkflowRowSelect();
    const rows = projectIds?.length
      ? await this.queryWorkflowRows(`${selectSql} WHERE sw.${sharedWorkflowProjectColumn} = ANY($1)`, [projectIds])
      : await this.queryWorkflowRows(selectSql);

    return rows as SharedWorkflowRow[];
  }
}
