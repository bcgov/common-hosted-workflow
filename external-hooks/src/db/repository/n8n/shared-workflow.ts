import { getColumnName, quoteIdentifier } from './sql';
import type { EntityMetadataLike, BaseN8nSharedWorkflowRepository } from '../../../api/types/n8n-adapters';

export type SharedWorkflowRow = {
  workflowId: string;
  workflowName: string;
  projectId: string;
};

export type PublishedWorkflowNodeRow = SharedWorkflowRow & {
  versionId: string;
  /** Node list of the published version (parsed JSON). */
  nodes: unknown;
};

type SharedWorkflowQueryResult = Array<Record<string, unknown>>;

const WORKFLOW_ENTITY_TABLE = 'workflow_entity';

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

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

  async findRowsByWorkflowIds(workflowIds: string[]): Promise<SharedWorkflowRow[]> {
    if (!workflowIds.length) {
      return [];
    }

    const { sharedWorkflowWorkflowColumn, selectSql } = this.buildWorkflowRowSelect();
    const rows = await this.queryWorkflowRows(`${selectSql} WHERE sw.${sharedWorkflowWorkflowColumn} = ANY($1)`, [
      workflowIds,
    ]);

    return rows as SharedWorkflowRow[];
  }

  /**
   * Published, non-archived workflows OWNED by one of `projectIds` whose published nodes include any of `nodeTypes`.
   *
   * `usePublicationService` mirrors n8n's `N8N_USE_WORKFLOW_PUBLICATION_SERVICE`: when on, the published version
   * lives in `workflow_published_version`; otherwise it is `workflow_entity.activeVersionId`.
   * Only the owning project is matched: a workflow runs with its owner's credentials, so a project that merely
   * has it shared must not be able to target it.
   */
  async findPublishedWithNodeType(params: {
    projectIds: string[];
    nodeTypes: readonly string[];
    usePublicationService: boolean;
  }): Promise<PublishedWorkflowNodeRow[]> {
    if (params.projectIds.length === 0 || params.nodeTypes.length === 0) return [];

    const sharedMetadata = this.sharedWorkflowRepository.metadata;
    const workflowMetadata = this.workflowMetadata;
    const workflowTable = quoteIdentifier(workflowMetadata.tableName);
    const sharedTable = quoteIdentifier(sharedMetadata.tableName);

    // History/published-version tables have no repository here; derive them from the (optional) table prefix.
    const prefix = workflowMetadata.tableName.endsWith(WORKFLOW_ENTITY_TABLE)
      ? workflowMetadata.tableName.slice(0, -WORKFLOW_ENTITY_TABLE.length)
      : '';
    const historyTable = quoteIdentifier(`${prefix}workflow_history`);
    const publishedTable = quoteIdentifier(`${prefix}workflow_published_version`);

    const wf = (name: string) => `w.${quoteIdentifier(getColumnName(workflowMetadata, name))}`;
    const sw = (name: string) => `sw.${quoteIdentifier(getColumnName(sharedMetadata, name))}`;

    const versionJoin = params.usePublicationService
      ? `INNER JOIN ${publishedTable} pv ON pv."workflowId" = ${wf('id')}
         INNER JOIN ${historyTable} h ON h."versionId" = pv."publishedVersionId"`
      : `INNER JOIN ${historyTable} h ON h."versionId" = ${wf('activeVersionId')}`;
    const publishedFilter = params.usePublicationService ? '' : `AND ${wf('activeVersionId')} IS NOT NULL`;

    const rows = await this.queryWorkflowRows(
      `
        SELECT
          ${wf('id')} AS "workflowId",
          ${wf('name')} AS "workflowName",
          ${sw('projectId')} AS "projectId",
          h."versionId" AS "versionId",
          h."nodes" AS "nodes"
        FROM ${workflowTable} w
        INNER JOIN ${sharedTable} sw ON ${sw('workflowId')} = ${wf('id')} AND ${sw('role')} = 'workflow:owner'
        ${versionJoin}
        WHERE ${wf('isArchived')} = false
          ${publishedFilter}
          AND ${sw('projectId')} = ANY($1)
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(h."nodes"::jsonb) AS n WHERE n->>'type' = ANY($2)
          )
      `,
      [params.projectIds, [...params.nodeTypes]],
    );

    return rows.map((row) => ({
      workflowId: String(row.workflowId),
      workflowName: String(row.workflowName),
      projectId: String(row.projectId),
      versionId: String(row.versionId),
      nodes: typeof row.nodes === 'string' ? safeJsonParse(row.nodes) : row.nodes,
    }));
  }

  async findWorkflowRowsByProjectIds(projectIds?: string[]): Promise<SharedWorkflowRow[]> {
    const { sharedWorkflowProjectColumn, selectSql } = this.buildWorkflowRowSelect();
    const rows = projectIds?.length
      ? await this.queryWorkflowRows(`${selectSql} WHERE sw.${sharedWorkflowProjectColumn} = ANY($1)`, [projectIds])
      : await this.queryWorkflowRows(selectSql);

    return rows as SharedWorkflowRow[];
  }
}
