import type { BaseN8nWorkflowRepository, N8nEntityRecord } from '../../../api/types/n8n-adapters';

export class WorkflowRepository {
  constructor(private readonly workflowRepository: BaseN8nWorkflowRepository) {}

  get metadata() {
    return this.workflowRepository.metadata;
  }

  async findOneBy(where: { id: string }) {
    return await this.workflowRepository.findOneBy(where);
  }

  /** Workflow with its published (`activeVersion`) history row and owner/shared projects loaded. */
  async findWithActiveVersion(id: string): Promise<N8nEntityRecord | null> {
    return await this.workflowRepository.findOne({
      where: { id },
      relations: { activeVersion: true, shared: true },
    });
  }
}
