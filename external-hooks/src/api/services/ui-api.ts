import { listN8nProjectIdsAccessibleToUser } from '../helpers/n8n-validation';

export type EntityMetadataLike = {
  tableName: string;
  columns: Array<{
    propertyName: string;
    databaseName: string;
  }>;
};

export type UiN8nUser = {
  id: string;
  email: string;
  role: {
    slug: string;
    displayName: string;
  } | null;
};

type UiWorkflowRow = {
  workflowId: string;
  workflowName: string;
  projectId: string;
};

export type UiWorkflowSummary = {
  workflowId: string;
  workflowName: string;
  projectIds: string[];
  userEmails: string[];
};

type RepositoryWithMetadata = {
  metadata: EntityMetadataLike;
};

type UiApiRepositories = {
  user: RepositoryWithMetadata & {
    findOne: (options: { where: { email: string }; relations: string[] }) => Promise<UiN8nUser | null>;
  };
  project: {
    getPersonalProjectForUser: (userId: string) => Promise<{ id: string } | null>;
  };
  projectRelation: RepositoryWithMetadata & {
    findAllByUser: (userId: string) => Promise<Array<{ projectId: string }>>;
    manager: {
      query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
    };
  };
  workflow: RepositoryWithMetadata;
  sharedWorkflow: RepositoryWithMetadata & {
    manager: {
      query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
    };
  };
};

function getColumnName(metadata: EntityMetadataLike, propertyName: string) {
  const column = metadata.columns.find((item) => item.propertyName === propertyName);
  if (!column) {
    throw new Error(`Missing column ${propertyName} on ${metadata.tableName}`);
  }
  return column.databaseName;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function canViewAllWorkflows(roleSlug?: string | null) {
  return roleSlug === 'global:owner' || roleSlug === 'global:admin';
}

export class UiApiService {
  constructor(private readonly n8nRepositories: UiApiRepositories) {}

  async getWhoami(email?: string) {
    const context = await this.loadUiUserContext(email);
    return context.n8nUser;
  }

  async getWorkflows(email?: string) {
    const context = await this.loadUiUserContext(email);
    return {
      n8nUser: context.n8nUser,
      accessibleProjectIds: context.accessibleProjectIds,
      workflows: context.workflows,
    };
  }

  private async loadUiUserContext(email?: string) {
    if (!email) {
      return { n8nUser: null, personalProjectId: null, accessibleProjectIds: [], workflows: [] as UiWorkflowSummary[] };
    }

    const n8nUser = await this.n8nRepositories.user.findOne({
      where: { email },
      relations: ['role'],
    });

    if (!n8nUser) {
      return { n8nUser: null, personalProjectId: null, accessibleProjectIds: [], workflows: [] as UiWorkflowSummary[] };
    }

    const [personalProject, accessibleProjectIds] = await Promise.all([
      this.n8nRepositories.project.getPersonalProjectForUser(n8nUser.id),
      listN8nProjectIdsAccessibleToUser(this.n8nRepositories.project, this.n8nRepositories.projectRelation, n8nUser.id),
    ]);
    const viewAllWorkflows = canViewAllWorkflows(n8nUser.role?.slug);

    const sharedWorkflowMetadata = this.n8nRepositories.sharedWorkflow.metadata;
    const workflowMetadata = this.n8nRepositories.workflow.metadata;
    const projectRelationMetadata = this.n8nRepositories.projectRelation.metadata;
    const userMetadata = this.n8nRepositories.user.metadata;

    const sharedWorkflowTable = quoteIdentifier(sharedWorkflowMetadata.tableName);
    const workflowTable = quoteIdentifier(workflowMetadata.tableName);
    const projectRelationTable = quoteIdentifier(projectRelationMetadata.tableName);
    const userTable = quoteIdentifier(userMetadata.tableName);

    const sharedWorkflowProjectColumn = quoteIdentifier(getColumnName(sharedWorkflowMetadata, 'projectId'));
    const sharedWorkflowWorkflowColumn = quoteIdentifier(getColumnName(sharedWorkflowMetadata, 'workflowId'));
    const workflowIdColumn = quoteIdentifier(getColumnName(workflowMetadata, 'id'));
    const workflowNameColumn = quoteIdentifier(getColumnName(workflowMetadata, 'name'));
    const projectRelationProjectColumn = quoteIdentifier(getColumnName(projectRelationMetadata, 'projectId'));
    const projectRelationUserColumn = quoteIdentifier(getColumnName(projectRelationMetadata, 'userId'));
    const userIdColumn = quoteIdentifier(getColumnName(userMetadata, 'id'));
    const userEmailColumn = quoteIdentifier(getColumnName(userMetadata, 'email'));

    const sharedWorkflowRows = viewAllWorkflows
      ? await this.n8nRepositories.sharedWorkflow.manager.query(
          `
            SELECT
              sw.${sharedWorkflowWorkflowColumn} AS "workflowId",
              w.${workflowNameColumn} AS "workflowName",
              sw.${sharedWorkflowProjectColumn} AS "projectId"
            FROM ${sharedWorkflowTable} sw
            INNER JOIN ${workflowTable} w ON w.${workflowIdColumn} = sw.${sharedWorkflowWorkflowColumn}
          `,
        )
      : accessibleProjectIds.length
        ? await this.n8nRepositories.sharedWorkflow.manager.query(
            `
            SELECT
              sw.${sharedWorkflowWorkflowColumn} AS "workflowId",
              w.${workflowNameColumn} AS "workflowName",
              sw.${sharedWorkflowProjectColumn} AS "projectId"
            FROM ${sharedWorkflowTable} sw
            INNER JOIN ${workflowTable} w ON w.${workflowIdColumn} = sw.${sharedWorkflowWorkflowColumn}
            WHERE sw.${sharedWorkflowProjectColumn} = ANY($1)
          `,
            [accessibleProjectIds],
          )
        : [];

    const workflowProjectIds = [...new Set((sharedWorkflowRows as UiWorkflowRow[]).map((row) => row.projectId))];

    const projectEmailRows = workflowProjectIds.length
      ? await this.n8nRepositories.projectRelation.manager.query(
          `
            SELECT
              pr.${projectRelationProjectColumn} AS "projectId",
              u.${userEmailColumn} AS "email"
            FROM ${projectRelationTable} pr
            INNER JOIN ${userTable} u ON u.${userIdColumn} = pr.${projectRelationUserColumn}
            WHERE pr.${projectRelationProjectColumn} = ANY($1)
          `,
          [workflowProjectIds],
        )
      : [];

    const projectEmailMap = new Map<string, Set<string>>();
    for (const row of projectEmailRows) {
      const projectId = String(row.projectId);
      const emailValue = String(row.email);
      if (!projectEmailMap.has(projectId)) projectEmailMap.set(projectId, new Set());
      projectEmailMap.get(projectId)?.add(emailValue);
    }

    if (personalProject?.id) {
      if (!projectEmailMap.has(personalProject.id)) projectEmailMap.set(personalProject.id, new Set());
      projectEmailMap.get(personalProject.id)?.add(n8nUser.email);
    }

    const workflowMap = new Map<string, { workflowName: string; projectIds: Set<string> }>();
    for (const row of sharedWorkflowRows as UiWorkflowRow[]) {
      const workflowId = row.workflowId;
      const workflowName = row.workflowName || row.workflowId;
      const projectId = row.projectId;
      const entry = workflowMap.get(workflowId) ?? { workflowName, projectIds: new Set<string>() };
      entry.projectIds.add(projectId);
      workflowMap.set(workflowId, entry);
    }

    const workflows: UiWorkflowSummary[] = [...workflowMap.entries()].map(([workflowId, entry]) => {
      const userEmails = new Set<string>();
      for (const projectId of entry.projectIds) {
        for (const emailValue of projectEmailMap.get(projectId) ?? []) {
          userEmails.add(emailValue);
        }
      }

      return {
        workflowId,
        workflowName: entry.workflowName,
        projectIds: [...entry.projectIds],
        userEmails: [...userEmails].sort((a, b) => a.localeCompare(b)),
      };
    });

    return {
      n8nUser,
      personalProjectId: personalProject?.id ?? null,
      accessibleProjectIds,
      workflows,
    };
  }
}
