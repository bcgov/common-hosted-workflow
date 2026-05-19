import { getColumnName, quoteIdentifier, type EntityMetadataLike } from './sql';
import type { WorkflowRepository } from './workflow';

type SharedWorkflowRow = {
  workflowId: string;
  workflowName: string;
  projectId: string;
};

export class SharedWorkflowRepository {
  constructor(
    private readonly sharedWorkflowRepository: {
      metadata: EntityMetadataLike;
      manager: { query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>> };
    },
    private readonly workflowRepository: WorkflowRepository,
  ) {}

  get metadata() {
    return this.sharedWorkflowRepository.metadata;
  }

  async findWorkflowRowsByProjectIds(projectIds?: string[]) {
    const sharedWorkflowMetadata = this.sharedWorkflowRepository.metadata;
    const workflowMetadata = this.workflowRepository.metadata;

    const sharedWorkflowTable = quoteIdentifier(sharedWorkflowMetadata.tableName);
    const workflowTable = quoteIdentifier(workflowMetadata.tableName);

    const sharedWorkflowProjectColumn = quoteIdentifier(getColumnName(sharedWorkflowMetadata, 'projectId'));
    const sharedWorkflowWorkflowColumn = quoteIdentifier(getColumnName(sharedWorkflowMetadata, 'workflowId'));
    const workflowIdColumn = quoteIdentifier(getColumnName(workflowMetadata, 'id'));
    const workflowNameColumn = quoteIdentifier(getColumnName(workflowMetadata, 'name'));

    const rows = projectIds?.length
      ? await this.sharedWorkflowRepository.manager.query(
          `
            SELECT
              sw.${sharedWorkflowWorkflowColumn} AS "workflowId",
              w.${workflowNameColumn} AS "workflowName",
              sw.${sharedWorkflowProjectColumn} AS "projectId"
            FROM ${sharedWorkflowTable} sw
            INNER JOIN ${workflowTable} w ON w.${workflowIdColumn} = sw.${sharedWorkflowWorkflowColumn}
            WHERE sw.${sharedWorkflowProjectColumn} = ANY($1)
          `,
          [projectIds],
        )
      : await this.sharedWorkflowRepository.manager.query(
          `
            SELECT
              sw.${sharedWorkflowWorkflowColumn} AS "workflowId",
              w.${workflowNameColumn} AS "workflowName",
              sw.${sharedWorkflowProjectColumn} AS "projectId"
            FROM ${sharedWorkflowTable} sw
            INNER JOIN ${workflowTable} w ON w.${workflowIdColumn} = sw.${sharedWorkflowWorkflowColumn}
          `,
        );

    return rows as SharedWorkflowRow[];
  }
}
