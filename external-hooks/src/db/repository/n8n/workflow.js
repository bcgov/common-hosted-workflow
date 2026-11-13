'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.WorkflowRepository = void 0;
class WorkflowRepository {
  workflowRepository;
  constructor(workflowRepository) {
    this.workflowRepository = workflowRepository;
  }
  get metadata() {
    return this.workflowRepository.metadata;
  }
  async findOneBy(where) {
    return await this.workflowRepository.findOneBy(where);
  }
  /** Workflow with its published (`activeVersion`) history row and owner/shared projects loaded. */
  async findWithActiveVersion(id) {
    return await this.workflowRepository.findOne({
      where: { id },
      relations: { activeVersion: true, shared: true },
    });
  }
}
exports.WorkflowRepository = WorkflowRepository;
