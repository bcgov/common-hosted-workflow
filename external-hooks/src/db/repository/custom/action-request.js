'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ActionRequestRepository = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const workflow_interaction_layer_1 = require('../../schema/workflow-interaction-layer');
class ActionRequestRepository {
  db;
  constructor(db) {
    this.db = db;
  }
  /**
   * List action requests matching the provided where clauses.
   *
   * Fetches one extra row beyond `limit` so callers can detect whether
   * another page exists without guessing from `rows.length === limit`
   * (which is wrong whenever the result set ends exactly on a page boundary).
   * Callers should trim the result via `paginateOverfetchedRows`.
   */
  async list(params) {
    return await this.db
      .select()
      .from(workflow_interaction_layer_1.actionRequest)
      .where((0, drizzle_orm_1.and)(...params.where))
      .orderBy(
        (0, drizzle_orm_1.desc)(workflow_interaction_layer_1.actionRequest.createdAt),
        (0, drizzle_orm_1.desc)(workflow_interaction_layer_1.actionRequest.id),
      )
      .limit(params.limit + 1);
  }
  /** Returns counts grouped by status for actions matching the provided where clauses. */
  async countByStatus(params) {
    const rows = await this.db
      .select({ status: workflow_interaction_layer_1.actionRequest.status, count: (0, drizzle_orm_1.count)() })
      .from(workflow_interaction_layer_1.actionRequest)
      .where((0, drizzle_orm_1.and)(...params.where))
      .groupBy(workflow_interaction_layer_1.actionRequest.status);
    const result = {};
    for (const row of rows) {
      result[row.status] = Number(row.count);
    }
    return result;
  }
  /** Returns one action request by id, optionally scoped by where clauses. */
  async getById(params) {
    const clauses = [
      (0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.id, params.actionId),
      ...(params.where ?? []),
    ];
    const [row] = await this.db
      .select()
      .from(workflow_interaction_layer_1.actionRequest)
      .where((0, drizzle_orm_1.and)(...clauses))
      .limit(1);
    return row ?? null;
  }
  /** Creates a new action request row. */
  async create(input) {
    const now = new Date();
    const [row] = await this.db
      .insert(workflow_interaction_layer_1.actionRequest)
      .values({
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  }
  /** Updates status by id with optimistic locking and optional additional fields. */
  async updateStatus(params) {
    const clauses = [
      (0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.id, params.actionId),
      ...(params.expectedStatus
        ? [(0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.status, params.expectedStatus)]
        : []),
      ...(params.where ?? []),
    ];
    const setValues = {
      status: params.status,
      updatedAt: new Date(),
      ...(params.additionalFields ?? {}),
    };
    const [row] = await this.db
      .update(workflow_interaction_layer_1.actionRequest)
      .set(setValues)
      .where((0, drizzle_orm_1.and)(...clauses))
      .returning();
    return row ?? null;
  }
  /** Atomically claims an action (pending → claimed). Returns updated row or null if preconditions not met. */
  async claim(params) {
    const clauses = [
      (0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.id, params.actionId),
      (0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.status, 'pending'),
      ...(params.where ?? []),
    ];
    const [row] = await this.db
      .update(workflow_interaction_layer_1.actionRequest)
      .set({
        status: 'claimed',
        claimedBy: params.claimedBy,
        claimedAt: new Date(),
        updatedAt: new Date(),
      })
      .where((0, drizzle_orm_1.and)(...clauses))
      .returning();
    return row ?? null;
  }
  /** Atomically unclaims an action (claimed|in_progress → pending). Returns updated row or null if preconditions not met. */
  async unclaim(params) {
    const clauses = [
      (0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.id, params.actionId),
      (0, drizzle_orm_1.inArray)(workflow_interaction_layer_1.actionRequest.status, ['claimed', 'in_progress']),
      ...(params.where ?? []),
    ];
    const [row] = await this.db
      .update(workflow_interaction_layer_1.actionRequest)
      .set({
        status: 'pending',
        claimedBy: null,
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where((0, drizzle_orm_1.and)(...clauses))
      .returning();
    return row ?? null;
  }
  /** Atomically starts an action (claimed → in_progress). Returns updated row or null if preconditions not met. */
  async startAction(params) {
    const clauses = [
      (0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.id, params.actionId),
      (0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.status, 'claimed'),
      (0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.claimedBy, params.claimedBy),
      ...(params.where ?? []),
    ];
    const [row] = await this.db
      .update(workflow_interaction_layer_1.actionRequest)
      .set({
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .where((0, drizzle_orm_1.and)(...clauses))
      .returning();
    return row ?? null;
  }
  /** Directly updates any combination of fields without state machine validation.
   *  Used by the WIL API (trusted service account) to set claim/completion fields directly. */
  async directUpdate(params) {
    const clauses = [
      (0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.id, params.actionId),
      ...(params.where ?? []),
    ];
    const [row] = await this.db
      .update(workflow_interaction_layer_1.actionRequest)
      .set(params.setValues)
      .where((0, drizzle_orm_1.and)(...clauses))
      .returning();
    return row ?? null;
  }
  /** Deletes all action requests for a project. */
  async deleteByProjectId(projectId) {
    await this.db
      .delete(workflow_interaction_layer_1.actionRequest)
      .where((0, drizzle_orm_1.eq)(workflow_interaction_layer_1.actionRequest.projectId, projectId));
  }
}
exports.ActionRequestRepository = ActionRequestRepository;
