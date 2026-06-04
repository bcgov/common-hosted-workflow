import type { N8nRepositoryService } from './n8n-repository';
import type { UiApiServiceContract } from '../types/services';
import { UiWorkflowQueryService } from './ui-workflow-query';
import { UiWorkflowSharingService } from './ui-workflow-sharing';

export type { UiWorkflowSummary } from '../types/ui-api';

export class UiApiService implements UiApiServiceContract {
  private readonly queryService: UiWorkflowQueryService;
  private readonly sharingService: UiWorkflowSharingService;

  constructor(repositoryService: N8nRepositoryService) {
    this.queryService = new UiWorkflowQueryService(repositoryService);
    this.sharingService = new UiWorkflowSharingService(this.queryService, repositoryService);
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
}
