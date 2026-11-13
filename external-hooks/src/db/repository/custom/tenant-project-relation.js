'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TenantProjectRelationRepository = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const workflow_interaction_layer_1 = require('../../schema/workflow-interaction-layer');
class TenantProjectRelationRepository {
  db;
  constructor(db) {
    this.db = db;
  }
  /** Returns all project IDs linked to a tenant. */
  async getProjectIdsByTenantId(tenantId) {
    const rows = await this.db
      .select({ projectId: workflow_interaction_layer_1.tenantProjectRelation.projectId })
      .from(workflow_interaction_layer_1.tenantProjectRelation)
      .where((0, drizzle_orm_1.eq)(workflow_interaction_layer_1.tenantProjectRelation.tenantId, tenantId));
    return rows.map((r) => r.projectId);
  }
  /** Returns the tenantId mapped to a projectId, or null if unmapped. */
  async getTenantIdByProjectId(projectId) {
    const [row] = await this.db
      .select({ tenantId: workflow_interaction_layer_1.tenantProjectRelation.tenantId })
      .from(workflow_interaction_layer_1.tenantProjectRelation)
      .where((0, drizzle_orm_1.eq)(workflow_interaction_layer_1.tenantProjectRelation.projectId, projectId))
      .limit(1);
    return row?.tenantId ?? null;
  }
  /** Returns all distinct tenant IDs from the relation table. */
  async listDistinctTenantIds() {
    const rows = await this.db
      .selectDistinct({ tenantId: workflow_interaction_layer_1.tenantProjectRelation.tenantId })
      .from(workflow_interaction_layer_1.tenantProjectRelation);
    return rows.map((r) => r.tenantId);
  }
  /** Inserts a tenant/project mapping. Caller must handle unique constraint violations. */
  async insert(params) {
    await this.db.insert(workflow_interaction_layer_1.tenantProjectRelation).values(params);
  }
  /**
   * Inserts a tenant/project mapping, silently ignoring conflicts.
   * Used during concurrent login scenarios where multiple requests may try
   * to create the same tenant-to-project mapping simultaneously.
   */
  async insertIgnoreConflict(params) {
    await this.db
      .insert(workflow_interaction_layer_1.tenantProjectRelation)
      .values(params)
      .onConflictDoNothing({
        target: [
          workflow_interaction_layer_1.tenantProjectRelation.tenantId,
          workflow_interaction_layer_1.tenantProjectRelation.projectId,
        ],
      });
  }
  /** Deletes the mapping for a given project ID. */
  async deleteByProjectId(projectId) {
    await this.db
      .delete(workflow_interaction_layer_1.tenantProjectRelation)
      .where((0, drizzle_orm_1.eq)(workflow_interaction_layer_1.tenantProjectRelation.projectId, projectId));
  }
  /** Upserts a tenant-project mapping. Uses the unique index on project_id for conflict resolution. */
  async upsertByProjectId(params) {
    await this.db
      .insert(workflow_interaction_layer_1.tenantProjectRelation)
      .values(params)
      .onConflictDoUpdate({
        target: workflow_interaction_layer_1.tenantProjectRelation.projectId,
        set: { tenantId: params.tenantId, projectType: params.projectType ?? null },
      });
  }
  /** Returns all tenant-project relations as a map of projectId → tenantId. */
  async listAll() {
    const rows = await this.db
      .select({
        projectId: workflow_interaction_layer_1.tenantProjectRelation.projectId,
        tenantId: workflow_interaction_layer_1.tenantProjectRelation.tenantId,
      })
      .from(workflow_interaction_layer_1.tenantProjectRelation);
    return new Map(rows.map((r) => [r.projectId, r.tenantId]));
  }
  /** Returns the first relation row for a tenant, including projectType. */
  async getRowByTenantId(tenantId) {
    const [row] = await this.db
      .select()
      .from(workflow_interaction_layer_1.tenantProjectRelation)
      .where((0, drizzle_orm_1.eq)(workflow_interaction_layer_1.tenantProjectRelation.tenantId, tenantId))
      .limit(1);
    return row ?? null;
  }
}
exports.TenantProjectRelationRepository = TenantProjectRelationRepository;
