import { AppError } from '../utils/errors';
import { listN8nProjectIdsAccessibleToUser } from '../helpers/n8n-validation';
import { ProjectRelationRepository } from '../../db/repository/n8n/project-relation';
import { SharedWorkflowRepository } from '../../db/repository/n8n/shared-workflow';
import { UserRepository, type N8nUiUser } from '../../db/repository/n8n/user';
import { WorkflowRepository } from '../../db/repository/n8n/workflow';

export type UiWorkflowSummary = {
  workflowId: string;
  workflowName: string;
  projectIds: string[];
  userEmails: string[];
  projectShares: Array<{
    projectId: string;
    userEmails: string[];
  }>;
};

type UiApiRepositories = {
  user: {
    metadata: any;
    findOne: (options: { where: { email: string }; relations: string[] }) => Promise<N8nUiUser | null>;
  };
  project: {
    getPersonalProjectForUser: (userId: string) => Promise<{ id: string } | null>;
  };
  projectRelation: {
    metadata: any;
    findAllByUser: (userId: string) => Promise<Array<{ projectId: string }>>;
    manager: any;
  };
  workflow: {
    metadata: any;
    findOneBy?: (where: { id: string }) => Promise<{ id: string } | null>;
  };
  sharedWorkflow: { metadata: any; create?: any; save?: any; delete?: any; manager: any };
  withTransaction: any;
};

function canViewAllWorkflows(roleSlug?: string | null) {
  return roleSlug === 'global:owner' || roleSlug === 'global:admin';
}

function canShareWorkflows(roleSlug?: string | null) {
  return canViewAllWorkflows(roleSlug);
}

function normalizeEmailSet(values: Set<string>) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export class UiApiService {
  constructor(private readonly n8nRepositories: UiApiRepositories) {}

  async getWhoami(email?: string) {
    return await this.buildUserContext(email).then((context) => context.n8nUser);
  }

  async getWorkflows(email?: string) {
    const context = await this.buildUserContext(email);
    return {
      n8nUser: context.n8nUser,
      accessibleProjectIds: context.accessibleProjectIds,
      workflows: context.workflows,
    };
  }

  async shareWorkflow(email: string | undefined, workflowId: string, targetEmail: string) {
    const context = await this.buildUserContext(email);
    if (!context.n8nUser) throw new AppError(401, 'Not authenticated.');
    if (!canShareWorkflows(context.n8nUser.role?.slug)) {
      throw new AppError(403, 'Sharing workflows is restricted to owner and admin users.');
    }

    const workflowRows = await this.loadWorkflowRows(workflowId);
    if (workflowRows.length === 0) {
      throw new AppError(404, 'Workflow not found.');
    }

    if (!canViewAllWorkflows(context.n8nUser.role?.slug)) {
      const hasAccess = workflowRows.some((row) => context.accessibleProjectIds.includes(row.projectId));
      if (!hasAccess) throw new AppError(403, 'Workflow is not accessible for this user.');
    }

    const targetUser = await new UserRepository(this.n8nRepositories.user).findByEmail(targetEmail);
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

    const sharedWorkflow = this.n8nRepositories.sharedWorkflow as {
      create?: (value: Record<string, unknown>) => Record<string, unknown>;
      save?: (value: Record<string, unknown>) => Promise<unknown>;
    };
    if (!sharedWorkflow?.create || !sharedWorkflow?.save) {
      throw new AppError(500, 'Shared workflow repository is unavailable.');
    }

    const newShare = sharedWorkflow.create({
      project: targetProject,
      workflow: { id: workflowId },
      role: 'workflow:owner',
    });
    await sharedWorkflow.save(newShare);

    return {
      workflowId,
      sharedWithEmail: targetEmail,
    };
  }

  async unshareWorkflow(email: string | undefined, workflowId: string, projectId: string) {
    const context = await this.buildUserContext(email);
    if (!context.n8nUser) throw new AppError(401, 'Not authenticated.');
    if (!canShareWorkflows(context.n8nUser.role?.slug)) {
      throw new AppError(403, 'Sharing workflows is restricted to owner and admin users.');
    }

    const workflowRows = await this.loadWorkflowRows(workflowId);
    if (workflowRows.length === 0) {
      throw new AppError(404, 'Workflow not found.');
    }
    if (workflowRows.length <= 1) {
      throw new AppError(409, 'Workflow must keep at least one project share.');
    }

    if (!canViewAllWorkflows(context.n8nUser.role?.slug)) {
      const hasAccess = workflowRows.some((row) => context.accessibleProjectIds.includes(row.projectId));
      if (!hasAccess) throw new AppError(403, 'Workflow is not accessible for this user.');
    }

    const targetShare = workflowRows.find((row) => row.projectId === projectId);
    if (!targetShare) {
      throw new AppError(404, 'Project is not associated with this workflow.');
    }

    const sharedWorkflow = this.n8nRepositories.sharedWorkflow as {
      delete?: (criteria: Record<string, unknown>) => Promise<unknown>;
      manager?: any;
    };
    if (sharedWorkflow?.delete) {
      await sharedWorkflow.delete({ workflow: { id: workflowId }, project: { id: projectId } });
      return { workflowId, projectId };
    }

    if (!sharedWorkflow?.manager?.delete) {
      throw new AppError(500, 'Shared workflow repository is unavailable.');
    }

    await sharedWorkflow.manager.delete('SharedWorkflow', { workflow: { id: workflowId }, project: { id: projectId } });

    return { workflowId, projectId };
  }

  private async buildUserContext(email?: string) {
    if (!email) {
      return { n8nUser: null, accessibleProjectIds: [], workflows: [] as UiWorkflowSummary[] };
    }

    const userRepository = new UserRepository(this.n8nRepositories.user);
    const projectRelationRepository = new ProjectRelationRepository(
      this.n8nRepositories.projectRelation,
      this.n8nRepositories.user,
    );
    const sharedWorkflowRepository = new SharedWorkflowRepository(
      this.n8nRepositories.sharedWorkflow,
      new WorkflowRepository(this.n8nRepositories.workflow),
    );

    const n8nUser = await userRepository.findByEmail(email);
    if (!n8nUser) {
      return { n8nUser: null, accessibleProjectIds: [], workflows: [] as UiWorkflowSummary[] };
    }

    const [personalProject, accessibleProjectIds] = await Promise.all([
      this.n8nRepositories.project.getPersonalProjectForUser(n8nUser.id),
      listN8nProjectIdsAccessibleToUser(this.n8nRepositories.project, this.n8nRepositories.projectRelation, n8nUser.id),
    ]);

    const sharedWorkflowRows = canViewAllWorkflows(n8nUser.role?.slug)
      ? await sharedWorkflowRepository.findWorkflowRowsByProjectIds()
      : await sharedWorkflowRepository.findWorkflowRowsByProjectIds(accessibleProjectIds);

    const workflowProjectIds = [...new Set(sharedWorkflowRows.map((row) => row.projectId))];
    const projectEmailRows = workflowProjectIds.length
      ? await projectRelationRepository.listUserEmailsByProjectIds(workflowProjectIds)
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
    for (const row of sharedWorkflowRows) {
      const entry = workflowMap.get(row.workflowId) ?? {
        workflowName: row.workflowName || row.workflowId,
        projectIds: new Set<string>(),
      };
      entry.projectIds.add(row.projectId);
      workflowMap.set(row.workflowId, entry);
    }

    const workflows: UiWorkflowSummary[] = [...workflowMap.entries()].map(([workflowId, entry]) => {
      const userEmails = new Set<string>();
      const projectShares = [...entry.projectIds].map((projectId) => ({
        projectId,
        userEmails: normalizeEmailSet(projectEmailMap.get(projectId) ?? new Set<string>()),
      }));
      for (const projectId of entry.projectIds) {
        for (const emailValue of projectEmailMap.get(projectId) ?? []) userEmails.add(emailValue);
      }

      return {
        workflowId,
        workflowName: entry.workflowName,
        projectIds: [...entry.projectIds],
        userEmails: normalizeEmailSet(userEmails),
        projectShares,
      };
    });

    return {
      n8nUser,
      accessibleProjectIds,
      workflows,
    };
  }

  private async loadWorkflowRows(workflowId: string) {
    const sharedWorkflowRepository = new SharedWorkflowRepository(
      this.n8nRepositories.sharedWorkflow,
      new WorkflowRepository(this.n8nRepositories.workflow),
    );
    return await sharedWorkflowRepository.findRowsByWorkflowId(workflowId);
  }
}
