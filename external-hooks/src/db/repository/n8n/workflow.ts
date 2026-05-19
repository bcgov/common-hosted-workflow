import type { EntityMetadataLike } from './sql';

export class WorkflowRepository {
  constructor(private readonly workflowRepository: { metadata: EntityMetadataLike }) {}

  get metadata() {
    return this.workflowRepository.metadata;
  }
}
