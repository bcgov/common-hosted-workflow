import { listProjectIdsAccessibleToUser } from './project-access';
import { buildWorkflowSummaries } from '../mappers/ui-workflows';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { UiApiContext, WorkflowRow } from '../types/ui-api';
import type { UserRepository } from '../../db/repository/n8n/user';
import type { ProjectRelationRepository } from '../../db/repository/n8n/project-relation';
import type { SharedWorkflowRepository } from '../../db/repository/n8n/shared-workflow';

function canViewAllWorkflows(roleSlug?: string | null) {
  return roleSlug === 'global:owner' || roleSlug === 'global:admin';
}

export class UiWorkflowQueryService {
  private readonly userRepository: UserRepository;
  private readonly projectRelationRepository: ProjectRelationRepository;
  private readonly sharedWorkflowRepository: SharedWorkflowRepository;

  constructor(private readonly n8nRepositories: N8nRepositories) {
    this.userRepository = n8nRepositories.user;
    this.projectRelationRepository = n8nRepositories.projectRelation;
    this.sharedWorkflowRepository = n8nRepositories.sharedWorkflow;
  }

  async getWhoami(email?: string) {
    if (!email) {
      return null;
    }

    return await this.userRepository.findByEmail(email);
  }

  async getWorkflows(email?: string) {
    const context = await this.loadUserContext(email);
    return {
      n8nUser: context.n8nUser,
      accessibleProjectIds: context.accessibleProjectIds,
      projects: context.projects,
      workflows: context.workflows,
    };
  }

  async loadUserContext(email?: string): Promise<UiApiContext> {
    if (!email) {
      return { n8nUser: null, accessibleProjectIds: [], projects: [], workflows: [] };
    }

    const n8nUser = await this.userRepository.findByEmail(email);
    if (!n8nUser) {
      return { n8nUser: null, accessibleProjectIds: [], projects: [], workflows: [] };
    }

    const [personalProject, accessibleProjectIds] = await Promise.all([
      this.n8nRepositories.project.getPersonalProjectForUser(n8nUser.id),
      listProjectIdsAccessibleToUser(this.n8nRepositories.project, this.n8nRepositories.projectRelation, n8nUser.id),
    ]);
    const projects = await this.loadAccessibleProjects(accessibleProjectIds);

    const workflowRows = canViewAllWorkflows(n8nUser.role?.slug)
      ? await this.sharedWorkflowRepository.findWorkflowRowsByProjectIds()
      : await this.sharedWorkflowRepository.findWorkflowRowsByProjectIds(accessibleProjectIds);
    const projectEmailMap = await this.loadProjectEmailMap(workflowRows, personalProject?.id, n8nUser.email);

    return {
      n8nUser,
      accessibleProjectIds,
      projects,
      workflows: buildWorkflowSummaries(workflowRows, projectEmailMap),
    };
  }

  async loadWorkflowRows(workflowId: string): Promise<WorkflowRow[]> {
    return await this.sharedWorkflowRepository.findRowsByWorkflowId(workflowId);
  }

  private async loadAccessibleProjects(projectIds: string[]) {
    const projects = await Promise.all(
      projectIds.map(async (projectId) => await this.n8nRepositories.project.findOneBy({ id: projectId })),
    );
    return projects.filter((project) => project !== null);
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
}
