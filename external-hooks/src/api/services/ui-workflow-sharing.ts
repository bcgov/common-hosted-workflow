import { AppError } from '../utils/errors';
import type { WorkflowRow } from '../types/ui-api';
import type { N8nRepositoryService } from './n8n-repository';
import { UiWorkflowQueryService } from './ui-workflow-query';

function canViewAllWorkflows(roleSlug?: string | null) {
  return roleSlug === 'global:owner' || roleSlug === 'global:admin';
}

function canShareWorkflows(roleSlug?: string | null) {
  return canViewAllWorkflows(roleSlug);
}

export class UiWorkflowSharingService {
  constructor(
    private readonly queryService: UiWorkflowQueryService,
    private readonly repositoryService: N8nRepositoryService,
  ) {}

  async shareWorkflow(email: string | undefined, workflowId: string, targetEmail: string) {
    const context = await this.requireManagingContext(email);
    const workflowRows = await this.queryService.loadWorkflowRows(workflowId);
    this.ensureWorkflowExists(workflowRows);
    this.ensureWorkflowVisibleToCaller(context, workflowRows);

    const targetUser = await this.queryService.getWhoami(targetEmail);
    if (!targetUser) {
      throw new AppError(404, 'Target user not found.');
    }

    const targetProject = await this.repositoryService.project.getPersonalProjectForUser(targetUser.id);
    if (!targetProject) {
      throw new AppError(404, 'Target user has no personal project.');
    }

    const targetProjectAlreadyShared = workflowRows.some((row) => row.projectId === targetProject.id);
    if (targetProjectAlreadyShared) {
      throw new AppError(409, 'Email is already associated with this workflow.');
    }

    const newShare = this.repositoryService.sharedWorkflow.create({
      project: targetProject,
      workflow: { id: workflowId },
      role: 'workflow:owner',
    });
    await this.repositoryService.sharedWorkflow.save(newShare);

    return {
      workflowId,
      sharedWithEmail: targetEmail,
    };
  }

  async unshareWorkflow(email: string | undefined, workflowId: string, projectId: string) {
    const context = await this.requireManagingContext(email);
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

    await this.repositoryService.sharedWorkflow.delete({ workflow: { id: workflowId }, project: { id: projectId } });

    return { workflowId, projectId };
  }

  private async requireManagingContext(email?: string) {
    const context = await this.queryService.loadUserContext(email);
    if (!context.n8nUser) throw new AppError(401, 'Not authenticated.');
    if (!canShareWorkflows(context.n8nUser.role?.slug)) {
      throw new AppError(403, 'Sharing workflows is restricted to owner and admin users.');
    }
    return context;
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
}
