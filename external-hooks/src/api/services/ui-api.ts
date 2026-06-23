import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { UiApiServiceContract } from '../types/services';
import { UiWorkflowQueryService } from './ui-workflow-query';
import { UiWorkflowSharingService } from './ui-workflow-sharing';

export type { UiWorkflowSummary } from '../types/ui-api';

export class UiApiService implements UiApiServiceContract {
  private readonly queryService: UiWorkflowQueryService;
  private readonly sharingService: UiWorkflowSharingService;

  constructor(n8nRepositories: N8nRepositories) {
    this.queryService = new UiWorkflowQueryService(n8nRepositories);
    this.sharingService = new UiWorkflowSharingService(this.queryService, n8nRepositories);
  }

  async getWhoami(email?: string) {
    return await this.queryService.getWhoami(email);
  }

  async loadUserContext(email?: string) {
    return await this.queryService.loadUserContext(email);
  }

  async getWorkflows(email?: string) {
    return await this.queryService.getWorkflows(email);
  }

  async shareWorkflow(email: string | undefined, workflowId: string, targetEmail: string) {
    return await this.sharingService.shareWorkflow(email, workflowId, targetEmail);
  }

  async unshareWorkflow(email: string | undefined, workflowId: string, projectId: string) {
    return await this.sharingService.unshareWorkflow(email, workflowId, projectId);
  }

  async ensureCredentialsSharedWithProject(credentialIds: string[], projectId: string) {
    return await this.sharingService.ensureCredentialsSharedWithProject(credentialIds, projectId);
  }
}
