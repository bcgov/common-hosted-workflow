"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowTriggerRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const workflow_trigger_1 = require("../../schema/workflow-trigger");
class WorkflowTriggerRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /** List workflow triggers matching the provided where clauses. */
    async list(params) {
        return await this.db
            .select()
            .from(workflow_trigger_1.workflowTrigger)
            .where((0, drizzle_orm_1.and)(...params.where))
            .orderBy((0, drizzle_orm_1.desc)(workflow_trigger_1.workflowTrigger.createdAt), (0, drizzle_orm_1.desc)(workflow_trigger_1.workflowTrigger.id))
            .limit(params.limit);
    }
    /** Returns one workflow trigger by id, optionally scoped by where clauses. */
    async getById(params) {
        const clauses = [(0, drizzle_orm_1.eq)(workflow_trigger_1.workflowTrigger.id, params.triggerId), ...(params.where ?? [])];
        const [row] = await this.db
            .select()
            .from(workflow_trigger_1.workflowTrigger)
            .where((0, drizzle_orm_1.and)(...clauses))
            .limit(1);
        return row ?? null;
    }
    /** Creates a new workflow trigger row. */
    async create(input) {
        const now = new Date();
        const [row] = await this.db
            .insert(workflow_trigger_1.workflowTrigger)
            .values({
            projectId: input.projectId,
            triggerType: input.triggerType,
            targetKind: input.targetKind ?? 'n8n-node',
            targetWorkflowId: input.targetWorkflowId ?? null,
            targetNodeId: input.targetNodeId ?? null,
            metadata: input.metadata,
            allowedActorsType: input.allowedActorsType,
            allowedActors: input.allowedActors,
            authEnabled: input.authEnabled ?? false,
            createdBy: input.createdBy ?? null,
            createdAt: now,
            updatedAt: now,
        })
            .returning();
        return row;
    }
    /** Updates all mutable fields (except triggerType) by id. */
    async update(params) {
        const clauses = [(0, drizzle_orm_1.eq)(workflow_trigger_1.workflowTrigger.id, params.triggerId), ...(params.where ?? [])];
        const [row] = await this.db
            .update(workflow_trigger_1.workflowTrigger)
            .set({
            // Target columns are replaced as a unit so the node-shape CHECK always holds.
            targetKind: params.targetKind ?? 'n8n-node',
            targetWorkflowId: params.targetWorkflowId ?? null,
            targetNodeId: params.targetNodeId ?? null,
            metadata: params.metadata,
            allowedActorsType: params.allowedActorsType,
            allowedActors: params.allowedActors,
            authEnabled: params.authEnabled,
            updatedAt: new Date(),
            updatedBy: params.updatedBy,
        })
            .where((0, drizzle_orm_1.and)(...clauses))
            .returning();
        return row ?? null;
    }
    /** Deletes one workflow trigger by id. Returns the deleted row or null. */
    async deleteById(params) {
        const clauses = [(0, drizzle_orm_1.eq)(workflow_trigger_1.workflowTrigger.id, params.triggerId), ...(params.where ?? [])];
        const [row] = await this.db
            .delete(workflow_trigger_1.workflowTrigger)
            .where((0, drizzle_orm_1.and)(...clauses))
            .returning();
        return row ?? null;
    }
    /** Returns all trigger IDs for a list of project IDs. */
    async listIdsByProjectIds(projectIds) {
        const rows = await this.db
            .select({ id: workflow_trigger_1.workflowTrigger.id })
            .from(workflow_trigger_1.workflowTrigger)
            .where((0, drizzle_orm_1.inArray)(workflow_trigger_1.workflowTrigger.projectId, projectIds));
        return rows.map((r) => r.id);
    }
    /** Deletes all workflow triggers for a project. */
    async deleteByProjectId(projectId) {
        await this.db.delete(workflow_trigger_1.workflowTrigger).where((0, drizzle_orm_1.eq)(workflow_trigger_1.workflowTrigger.projectId, projectId));
    }
}
exports.WorkflowTriggerRepository = WorkflowTriggerRepository;
