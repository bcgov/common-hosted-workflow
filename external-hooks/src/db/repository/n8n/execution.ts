import type { N8nExecutionRepository } from '../../../api/types/n8n-adapters';

export class ExecutionRepository {
  constructor(private readonly executionRepository: N8nExecutionRepository) {}

  get metadata() {
    return this.executionRepository.metadata;
  }

  async findSingleExecution(id: string, options?: { includeData?: boolean; unflattenData?: boolean }) {
    return await this.executionRepository.findSingleExecution(id, options);
  }
}
