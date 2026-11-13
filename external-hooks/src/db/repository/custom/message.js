"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const workflow_interaction_layer_1 = require("../../schema/workflow-interaction-layer");
class MessageRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * List messages matching the provided where clauses.
     *
     * Fetches one extra row beyond `limit` so callers can detect whether
     * another page exists without guessing from `rows.length === limit`
     * (which is wrong whenever the result set ends exactly on a page boundary).
     * Callers should trim the result via `paginateOverfetchedRows`.
     */
    async list(params) {
        return await this.db
            .select()
            .from(workflow_interaction_layer_1.message)
            .where((0, drizzle_orm_1.and)(...params.where))
            .orderBy((0, drizzle_orm_1.desc)(workflow_interaction_layer_1.message.createdAt), (0, drizzle_orm_1.desc)(workflow_interaction_layer_1.message.id))
            .limit(params.limit + 1);
    }
    /** Creates a new message row. */
    async create(input) {
        const now = new Date();
        const [row] = await this.db
            .insert(workflow_interaction_layer_1.message)
            .values({
            ...input,
            createdAt: now,
            updatedAt: now,
        })
            .returning();
        return row;
    }
    /** Deletes all messages for a project. */
    async deleteByProjectId(projectId) {
        await this.db.delete(workflow_interaction_layer_1.message).where((0, drizzle_orm_1.eq)(workflow_interaction_layer_1.message.projectId, projectId));
    }
}
exports.MessageRepository = MessageRepository;
