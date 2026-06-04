import type { BaseN8nWorkflowRepository } from '../../../api/types/n8n-adapters';

export class WorkflowRepository {
  constructor(private readonly workflowRepository: BaseN8nWorkflowRepository) {}

  get metadata() {
    return this.workflowRepository.metadata;
  }
}
