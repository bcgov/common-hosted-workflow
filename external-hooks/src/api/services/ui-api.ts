import { AppError } from '../utils/errors';
import { listN8nProjectIdsAccessibleToUser } from '../helpers/n8n-validation';
import { ProjectRelationRepository } from '../../db/repository/n8n/project-relation';
import { SharedWorkflowRepository } from '../../db/repository/n8n/shared-workflow';
import { UserRepository, type N8nUiUser } from '../../db/repository/n8n/user';
import { WorkflowRepository } from '../../db/repository/n8n/workflow';

type UiWorkflowProjectShare = {
  projectId: string;
  userEmails: string[];
};

export type UiWorkflowSummary = {
  workflowId: string;
  workflowName: string;
  projectIds: string[];
  userEmails: string[];
  projectShares: UiWorkflowProjectShare[];
};

type UiApiContext = {
  n8nUser: N8nUiUser | null;
  accessibleProjectIds: string[];
  workflows: UiWorkflowSummary[];
};

type N8nUserRepository = {
  metadata: any;
  findOne: (options: { where: { email: string }; relations: string[] }) => Promise<N8nUiUser | null>;
};

type N8nProjectRepository = {
  getPersonalProjectForUser: (userId: string) => Promise<{ id: string } | null>;
};

type N8nProjectRelationRepository = {
  metadata: any;
  findAllByUser: (userId: string) => Promise<Array<{ projectId: string }>>;
  manager: { query: (sql: string, params?: unknown[]) => Promise<Array<{ projectId: string; email: string }>> };
};

type N8nWorkflowRepository = {
  metadata: any;
  findOneBy?: (where: { id: string }) => Promise<{ id: string } | null>;
};

type N8nSharedWorkflowRepository = {
  metadata: any;
  create?: (value: Record<string, unknown>) => Record<string, unknown>;
  save?: (value: Record<string, unknown>) => Promise<unknown>;
  delete?: (criteria: Record<string, unknown>) => Promise<unknown>;
  manager: {
    query: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
    delete?: (entity: string, criteria: Record<string, unknown>) => Promise<unknown>;
  };
};

type UiApiRepositories = {
  user: N8nUserRepository;
  project: N8nProjectRepository;
  projectRelation: N8nProjectRelationRepository;
  workflow: N8nWorkflowRepository;
  sharedWorkflow: N8nSharedWorkflowRepository;
  withTransaction: any;
};

type WorkflowRow = {
  workflowId: string;
  workflowName: string;
  projectId: string;
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
  private readonly userRepository: UserRepository;
  private readonly projectRelationRepository: ProjectRelationRepository;
  private readonly sharedWorkflowRepository: SharedWorkflowRepository;

  constructor(private readonly n8nRepositories: UiApiRepositories) {
    this.userRepository = new UserRepository(n8nRepositories.user);
    this.projectRelationRepository = new ProjectRelationRepository(
      n8nRepositories.projectRelation,
      n8nRepositories.user,
    );
    this.sharedWorkflowRepository = new SharedWorkflowRepository(
      n8nRepositories.sharedWorkflow,
      new WorkflowRepository(n8nRepositories.workflow),
    );
  }

  async getWhoami(email?: string) {
    const context = await this.buildUserContext(email);
    return context.n8nUser;
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
    const context = await this.requireManagingContext(email);
    const workflowRows = await this.loadWorkflowRows(workflowId);
    this.ensureWorkflowExists(workflowRows);
    this.ensureWorkflowVisibleToCaller(context, workflowRows);

    const targetUser = await this.userRepository.findByEmail(targetEmail);
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

    await this.createWorkflowShare(workflowId, targetProject);

    return {
      workflowId,
      sharedWithEmail: targetEmail,
    };
  }

  async unshareWorkflow(email: string | undefined, workflowId: string, projectId: string) {
    const context = await this.requireManagingContext(email);
    const workflowRows = await this.loadWorkflowRows(workflowId);
    this.ensureWorkflowExists(workflowRows);
    if (workflowRows.length <= 1) {
      throw new AppError(409, 'Workflow must keep at least one project share.');
    }

    this.ensureWorkflowVisibleToCaller(context, workflowRows);

    const targetShare = workflowRows.find((row) => row.projectId === projectId);
    if (!targetShare) {
      throw new AppError(404, 'Project is not associated with this workflow.');
    }

    await this.deleteWorkflowShare(workflowId, projectId);

    return { workflowId, projectId };
  }

  private async requireManagingContext(email?: string) {
    const context = await this.buildUserContext(email);
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
    context: { n8nUser: N8nUiUser | null; accessibleProjectIds: string[] },
    workflowRows: WorkflowRow[],
  ) {
    if (canViewAllWorkflows(context.n8nUser?.role?.slug)) return;
    const hasAccess = workflowRows.some((row) => context.accessibleProjectIds.includes(row.projectId));
    if (!hasAccess) {
      throw new AppError(403, 'Workflow is not accessible for this user.');
    }
  }

  private async buildUserContext(email?: string): Promise<UiApiContext> {
    if (!email) {
      return { n8nUser: null, accessibleProjectIds: [], workflows: [] as UiWorkflowSummary[] };
    }

    const n8nUser = await this.userRepository.findByEmail(email);
    if (!n8nUser) {
      return { n8nUser: null, accessibleProjectIds: [], workflows: [] as UiWorkflowSummary[] };
    }

    const [personalProject, accessibleProjectIds] = await this.loadUserProjectScope(n8nUser.id);

    const sharedWorkflowRows = await this.loadVisibleWorkflowRows(n8nUser.role?.slug, accessibleProjectIds);
    const projectEmailMap = await this.loadProjectEmailMap(sharedWorkflowRows, personalProject?.id, n8nUser.email);
    const workflows = this.buildWorkflowSummaries(sharedWorkflowRows, projectEmailMap);

    return {
      n8nUser,
      accessibleProjectIds,
      workflows,
    };
  }

  private async loadUserProjectScope(userId: string) {
    return await Promise.all([
      this.n8nRepositories.project.getPersonalProjectForUser(userId),
      listN8nProjectIdsAccessibleToUser(this.n8nRepositories.project, this.n8nRepositories.projectRelation, userId),
    ]);
  }

  private async loadVisibleWorkflowRows(roleSlug: string | null | undefined, accessibleProjectIds: string[]) {
    return canViewAllWorkflows(roleSlug)
      ? await this.sharedWorkflowRepository.findWorkflowRowsByProjectIds()
      : await this.sharedWorkflowRepository.findWorkflowRowsByProjectIds(accessibleProjectIds);
  }

  private async loadProjectEmailMap(
    workflowRows: WorkflowRow[],
    personalProjectId: string | undefined,
    userEmail: string,
  ) {
    const workflowProjectIds = [...new Set(workflowRows.map((row) => row.projectId))];
    const projectEmailRows = workflowProjectIds.length
      ? await this.projectRelationRepository.listUserEmailsByProjectIds(workflowProjectIds)
      : [];

    const projectEmailMap = new Map<string, Set<string>>();
    for (const row of projectEmailRows) {
      const projectId = String(row.projectId);
      const emailValue = String(row.email);
      if (!projectEmailMap.has(projectId)) projectEmailMap.set(projectId, new Set());
      projectEmailMap.get(projectId)?.add(emailValue);
    }

    if (personalProjectId) {
      if (!projectEmailMap.has(personalProjectId)) projectEmailMap.set(personalProjectId, new Set());
      projectEmailMap.get(personalProjectId)?.add(userEmail);
    }

    return projectEmailMap;
  }

  private buildWorkflowSummaries(workflowRows: WorkflowRow[], projectEmailMap: Map<string, Set<string>>) {
    const workflowMap = new Map<string, { workflowName: string; projectIds: Set<string> }>();
    for (const row of workflowRows) {
      const entry = workflowMap.get(row.workflowId) ?? {
        workflowName: row.workflowName || row.workflowId,
        projectIds: new Set<string>(),
      };
      entry.projectIds.add(row.projectId);
      workflowMap.set(row.workflowId, entry);
    }

    return [...workflowMap.entries()].map(([workflowId, entry]) =>
      this.buildWorkflowSummary(workflowId, entry.workflowName, entry.projectIds, projectEmailMap),
    );
  }

  private buildWorkflowSummary(
    workflowId: string,
    workflowName: string,
    projectIds: Set<string>,
    projectEmailMap: Map<string, Set<string>>,
  ): UiWorkflowSummary {
    const userEmails = new Set<string>();
    const projectShares = [...projectIds].map((projectId) => {
      const emails = normalizeEmailSet(projectEmailMap.get(projectId) ?? new Set<string>());
      for (const emailValue of emails) userEmails.add(emailValue);
      return { projectId, userEmails: emails };
    });

    return {
      workflowId,
      workflowName,
      projectIds: [...projectIds],
      userEmails: normalizeEmailSet(userEmails),
      projectShares,
    };
  }

  private async loadWorkflowRows(workflowId: string) {
    return await this.sharedWorkflowRepository.findRowsByWorkflowId(workflowId);
  }

  private async createWorkflowShare(workflowId: string, project: { id: string }) {
    const sharedWorkflow = this.n8nRepositories.sharedWorkflow as {
      create?: (value: Record<string, unknown>) => Record<string, unknown>;
      save?: (value: Record<string, unknown>) => Promise<unknown>;
    };
    if (!sharedWorkflow?.create || !sharedWorkflow?.save) {
      throw new AppError(500, 'Shared workflow repository is unavailable.');
    }

    const newShare = sharedWorkflow.create({
      project,
      workflow: { id: workflowId },
      role: 'workflow:owner',
    });
    await sharedWorkflow.save(newShare);
  }

  private async deleteWorkflowShare(workflowId: string, projectId: string) {
    const sharedWorkflow = this.n8nRepositories.sharedWorkflow as {
      delete?: (criteria: Record<string, unknown>) => Promise<unknown>;
      manager?: { delete: (entity: string, criteria: Record<string, unknown>) => Promise<unknown> };
    };

    if (sharedWorkflow?.delete) {
      await sharedWorkflow.delete({ workflow: { id: workflowId }, project: { id: projectId } });
      return;
    }

    if (!sharedWorkflow?.manager?.delete) {
      throw new AppError(500, 'Shared workflow repository is unavailable.');
    }

    await sharedWorkflow.manager.delete('SharedWorkflow', { workflow: { id: workflowId }, project: { id: projectId } });
  }
}
