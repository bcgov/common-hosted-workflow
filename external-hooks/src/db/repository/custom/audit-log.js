'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AuditLogRepository = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const workflow_interaction_layer_1 = require('../../schema/workflow-interaction-layer');
class AuditLogRepository {
  db;
  constructor(db) {
    this.db = db;
  }
  /** Deletes all audit log rows for a project. */
  async deleteByProjectId(projectId) {
    await this.db
      .delete(workflow_interaction_layer_1.auditLog)
      .where((0, drizzle_orm_1.eq)(workflow_interaction_layer_1.auditLog.projectId, projectId));
  }
}
exports.AuditLogRepository = AuditLogRepository;
