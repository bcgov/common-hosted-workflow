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
};

type UiApiRepositories = {
  user: {
    metadata: any;
    findOne: (options: { where: { email: string }; relations: string[] }) => Promise<N8nUiUser | null>;
  };
  project: { getPersonalProjectForUser: (userId: string) => Promise<{ id: string } | null> };
  projectRelation: {
    metadata: any;
    findAllByUser: (userId: string) => Promise<Array<{ projectId: string }>>;
    manager: any;
  };
  workflow: { metadata: any };
  sharedWorkflow: { metadata: any; manager: any };
};

function canViewAllWorkflows(roleSlug?: string | null) {
  return roleSlug === 'global:owner' || roleSlug === 'global:admin';
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
      for (const projectId of entry.projectIds) {
        for (const emailValue of projectEmailMap.get(projectId) ?? []) userEmails.add(emailValue);
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
      accessibleProjectIds,
      workflows,
    };
  }
}
