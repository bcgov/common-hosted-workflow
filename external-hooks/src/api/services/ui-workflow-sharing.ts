import { AppError } from '../utils/errors';
import type { WorkflowRow } from '../types/ui-api';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import { UiWorkflowQueryService } from './ui-workflow-query';

type WorkflowNode = {
  credentials?: Record<string, { id?: string | null } | null>;
};

type SharingContext = {
  n8nUser: { id: string; role?: { slug: string } | null };
  accessibleProjectIds: string[];
};

const SHAREABLE_PROJECT_ROLE_SLUGS = new Set(['project:owner', 'project:admin']);

function extractCredentialIds(nodes: WorkflowNode[]): string[] {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (!node.credentials) continue;
    for (const cred of Object.values(node.credentials)) {
      if (cred?.id) ids.add(cred.id);
    }
  }
  return Array.from(ids);
}

function getWorkflowNodes(workflow: unknown): WorkflowNode[] {
  if (!workflow || typeof workflow !== 'object') {
    return [];
  }

  const nodes = Reflect.get(workflow, 'nodes');
  return Array.isArray(nodes) ? (nodes as WorkflowNode[]) : [];
}

function canViewAllWorkflows(roleSlug?: string | null) {
  return roleSlug === 'global:owner' || roleSlug === 'global:admin';
}

function canShareWorkflows(roleSlug?: string | null) {
  return roleSlug !== null && roleSlug !== undefined;
}

function getRoleSlug(role: unknown): string | null {
  if (!role || typeof role !== 'object') {
    return null;
  }

  const slug = Reflect.get(role, 'slug');
  return typeof slug === 'string' ? slug : null;
}

export class UiWorkflowSharingService {
  constructor(
    private readonly queryService: UiWorkflowQueryService,
    private readonly n8nRepositories: N8nRepositories,
  ) {}

  async shareWorkflow(email: string | undefined, workflowId: string, targetEmail: string) {
    const context = await this.requireManagingContext(email);

    const workflowRows = await this.queryService.loadWorkflowRows(workflowId);
    this.ensureWorkflowExists(workflowRows);
    this.ensureWorkflowVisibleToCaller(context, workflowRows);
    await this.ensureWorkflowShareableByCaller(context, workflowRows);

    const targetUser = await this.queryService.getWhoami(targetEmail);
    if (!targetUser) {
      throw new AppError(404, 'Target user not found.');
    }

    const targetProject = await this.n8nRepositories.project.getPersonalProjectForUser(targetUser.id);
    if (!targetProject) {
      throw new AppError(404, 'Target user has no personal project.');
    }

    const targetProjectAlreadyShared = workflowRows.some((row) => row.projectId === targetProject.id);
    if (targetProjectAlreadyShared) {
      throw new AppError(409, 'Email is already associated with this workflow.');
    }

    const workflow = await this.n8nRepositories.workflow.findOneBy({ id: workflowId });
    const credentialIds = extractCredentialIds(getWorkflowNodes(workflow));

    await this.n8nRepositories.withTransaction(this.n8nRepositories.sharedWorkflow.manager, null, async (tx) => {
      const newShare = this.n8nRepositories.sharedWorkflow.create({
        project: targetProject,
        workflow: { id: workflowId },
        role: 'workflow:owner',
      });
      await tx.save(newShare);

      if (credentialIds.length > 0) {
        await this.shareWorkflowCredentialsInTransaction(credentialIds, targetProject.id, tx);
      }
    });

    return {
      workflowId,
      sharedWithEmail: targetEmail,
    };
  }

  async unshareWorkflow(email: string | undefined, workflowId: string, projectId: string) {
    const context = await this.requireManagingContext(email);
    this.ensureWorkflowUnshareableByCaller(context);
    const workflowRows = await this.queryService.loadWorkflowRows(workflowId);
    this.ensureWorkflowExists(workflowRows);
    if (workflowRows.length <= 1) {
      throw new AppError(409, 'Workflow must keep at least one project share.');
    }

    this.ensureWorkflowVisibleToCaller(context, workflowRows);

    const targetShare = workflowRows.find((row) => row.projectId === projectId);
    if (!targetShare) {
      throw new AppError(404, 'Project is not associated with this workflow.');
    }

    const manager = this.n8nRepositories.sharedCredential.manager;

    await this.n8nRepositories.withTransaction(this.n8nRepositories.sharedWorkflow.manager, null, async (tx) => {
      await tx.delete('SharedWorkflow', { workflow: { id: workflowId }, project: { id: projectId } });

      await this.unshareWorkflowCredentialsIfUnused(workflowId, projectId, tx, manager);
    });

    return { workflowId, projectId };
  }

  private async requireManagingContext(email?: string): Promise<SharingContext> {
    const context = await this.queryService.loadUserContext(email);
    if (!context.n8nUser) throw new AppError(401, 'Not authenticated.');
    if (!canShareWorkflows(context.n8nUser.role?.slug)) {
      throw new AppError(403, 'Sharing workflows is restricted to active users with a role.');
    }
    return context as SharingContext;
  }

  private async ensureWorkflowShareableByCaller(context: SharingContext, workflowRows: WorkflowRow[]) {
    if (canViewAllWorkflows(context.n8nUser.role?.slug)) {
      return;
    }

    const personalProject = await this.n8nRepositories.project.getPersonalProjectForUser(context.n8nUser.id);

    for (const projectId of new Set(workflowRows.map((row) => row.projectId))) {
      if (personalProject?.id === projectId) {
        return;
      }

      const projectRole = await this.n8nRepositories.projectRelation.findProjectRole({
        userId: context.n8nUser.id,
        projectId,
      });
      if (SHAREABLE_PROJECT_ROLE_SLUGS.has(getRoleSlug(projectRole) ?? '')) {
        return;
      }
    }

    throw new AppError(403, 'Sharing this workflow is restricted to workflow admins.');
  }

  private ensureWorkflowUnshareableByCaller(context: SharingContext) {
    if (!canViewAllWorkflows(context.n8nUser.role?.slug)) {
      throw new AppError(403, 'Unsharing workflows is restricted to owner and admin users.');
    }
  }

  private ensureWorkflowExists(workflowRows: WorkflowRow[]) {
    if (!workflowRows.length) {
      throw new AppError(404, 'Workflow not found.');
    }
  }

  private ensureWorkflowVisibleToCaller(
    context: { n8nUser: { role?: { slug: string } | null } | null; accessibleProjectIds: string[] },
    workflowRows: WorkflowRow[],
  ) {
    if (canViewAllWorkflows(context.n8nUser?.role?.slug)) return;
    const hasAccess = workflowRows.some((row) => context.accessibleProjectIds.includes(row.projectId));
    if (!hasAccess) {
      throw new AppError(403, 'Workflow is not accessible for this user.');
    }
  }

  private async shareWorkflowCredentialsInTransaction(
    credentialIds: string[],
    targetProjectId: string,
    tx: {
      create: (entityName: string, payload: Record<string, unknown>) => Record<string, unknown>;
      save: (value: unknown) => Promise<unknown>;
    },
  ) {
    if (!credentialIds.length) return;

    const existingRows = await this.n8nRepositories.sharedCredential.manager.query(
      `SELECT "credentialsId" FROM shared_credentials WHERE "projectId" = $1 AND "credentialsId" = ANY($2)`,
      [targetProjectId, credentialIds],
    );
    const existingIds = new Set<string>((existingRows as Array<{ credentialsId: string }>).map((r) => r.credentialsId));

    const newShares = credentialIds
      .filter((id) => !existingIds.has(id))
      .map((credentialsId) => ({
        credentialsId,
        projectId: targetProjectId,
        role: 'credential:owner' as const,
      }));

    if (newShares.length === 0) return;

    const createdShares = newShares.map((share) => tx.create('SharedCredentials', share));
    await Promise.all(createdShares.map((share) => tx.save(share)));
  }

  private async unshareWorkflowCredentialsIfUnused(
    workflowId: string,
    projectId: string,
    tx: { delete: (entityName: string, criteria: unknown) => Promise<unknown> },
    manager: { query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>> },
  ) {
    const workflow = await this.n8nRepositories.workflow.findOneBy({ id: workflowId });
    const credentialIds = extractCredentialIds(getWorkflowNodes(workflow));
    if (!credentialIds.length) return;

    const otherWorkflowRows = await this.n8nRepositories.sharedWorkflow.manager.query(
      `SELECT DISTINCT sw."workflowId"
       FROM shared_workflow sw
       INNER JOIN workflow_entity w ON w.id = sw."workflowId"
       WHERE sw."projectId" = $1
         AND sw."workflowId" != $2
         AND w.nodes IS NOT NULL`,
      [projectId, workflowId],
    );

    const otherWorkflowIds = (otherWorkflowRows as Array<{ workflowId: string }>).map((r) => r.workflowId);
    const stillUsedCredentialIds = new Set<string>();

    if (otherWorkflowIds.length > 0) {
      const otherWorkflows = await Promise.all(
        otherWorkflowIds.map((id) => this.n8nRepositories.workflow.findOneBy({ id })),
      );
      for (const otherWorkflow of otherWorkflows) {
        const ids = extractCredentialIds(getWorkflowNodes(otherWorkflow));
        if (ids.length) {
          for (const id of ids) stillUsedCredentialIds.add(id);
        }
      }
    }

    const credentialsToUnshare = credentialIds.filter((id) => !stillUsedCredentialIds.has(id));
    if (credentialsToUnshare.length === 0) return;

    const placeholders = credentialsToUnshare.map((_, i) => `$${i + 2}`).join(',');
    await manager.query(
      `DELETE FROM shared_credentials WHERE "projectId" = $1 AND "credentialsId" IN (${placeholders})`,
      [projectId, ...credentialsToUnshare],
    );
  }
}
