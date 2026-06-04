import type { N8nWorkflowRepository } from '../../../api/types/n8n-adapters';

export class WorkflowRepository {
  constructor(private readonly workflowRepository: N8nWorkflowRepository) {}

  get metadata() {
    return this.workflowRepository.metadata;
  }
}
