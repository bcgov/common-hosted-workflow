import type { BaseN8nExecutionRepository } from '../../../api/types/n8n-adapters';

export class ExecutionRepository {
  constructor(private readonly executionRepository: BaseN8nExecutionRepository) {}

  get metadata() {
    return this.executionRepository.metadata;
  }

  async findSingleExecution(id: string, options?: { includeData?: boolean; unflattenData?: boolean }) {
    return await this.executionRepository.findSingleExecution(id, options);
  }

  /** Loads an execution with its run data, or `null` if not found / unreadable. */
  async findWithData(id: string) {
    try {
      return (await this.findSingleExecution(id, { includeData: true, unflattenData: true })) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Loads execution metadata, or `null` if not found or if `findSingleExecution` throws
   * (e.g. Postgres `22P02` for malformed ids).
   */
  async loadMetadataOrNull(id: string): Promise<{ workflowId: string } | null> {
    try {
      const execution = await this.findSingleExecution(id, {
        includeData: false,
        unflattenData: false,
      });
      return execution ?? null;
    } catch {
      return null;
    }
  }
}
