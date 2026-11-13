"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiWebhookWaitRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const multi_webhook_wait_1 = require("../../schema/multi-webhook-wait");
class MultiWebhookWaitRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Registers a new multi-webhook wait group with its expected calls.
     * If a wait already exists for this execution, it is replaced (delete + re-insert).
     */
    async registerWait(params) {
        const { executionId, resumeUrl, expectedCalls } = params;
        const now = new Date();
        // Delete any existing wait for this execution (cascade removes child rows)
        await this.db.delete(multi_webhook_wait_1.multiWebhookWait).where((0, drizzle_orm_1.eq)(multi_webhook_wait_1.multiWebhookWait.executionId, executionId));
        // Insert the parent wait row
        const [waitRow] = await this.db
            .insert(multi_webhook_wait_1.multiWebhookWait)
            .values({
            executionId,
            resumeUrl,
            totalExpected: expectedCalls.length,
            totalReceived: 0,
            createdAt: now,
            updatedAt: now,
        })
            .returning();
        // Insert all expected call rows
        if (expectedCalls.length > 0) {
            await this.db.insert(multi_webhook_wait_1.multiWebhookWaitCall).values(expectedCalls.map((call) => ({
                executionId,
                matchKey: call.matchKey,
                received: false,
                receivedAt: null,
                payload: null,
                createdAt: now,
            })));
        }
        return waitRow;
    }
    /** Returns the wait row for an execution, or null if not found. */
    async getByExecutionId(executionId) {
        const [row] = await this.db
            .select()
            .from(multi_webhook_wait_1.multiWebhookWait)
            .where((0, drizzle_orm_1.eq)(multi_webhook_wait_1.multiWebhookWait.executionId, executionId))
            .limit(1);
        return row ?? null;
    }
    /** Returns all call rows for an execution. */
    async getCallsByExecutionId(executionId) {
        return await this.db.select().from(multi_webhook_wait_1.multiWebhookWaitCall).where((0, drizzle_orm_1.eq)(multi_webhook_wait_1.multiWebhookWaitCall.executionId, executionId));
    }
    /**
     * Marks a specific expected call as received, stores the payload, and
     * atomically increments the parent's total_received counter.
     *
     * Both operations run in a single transaction to prevent desync between
     * the call row state and the parent counter on crash.
     *
     * Returns the updated parent wait row, or null if the call was already
     * received or doesn't exist.
     */
    async markCallReceived(params) {
        const { executionId, matchKey, payload } = params;
        const now = new Date();
        return await this.db.transaction(async (tx) => {
            // Only update if not already received (idempotent)
            const [updatedCall] = await tx
                .update(multi_webhook_wait_1.multiWebhookWaitCall)
                .set({
                received: true,
                receivedAt: now,
                payload,
            })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(multi_webhook_wait_1.multiWebhookWaitCall.executionId, executionId), (0, drizzle_orm_1.eq)(multi_webhook_wait_1.multiWebhookWaitCall.matchKey, matchKey), (0, drizzle_orm_1.eq)(multi_webhook_wait_1.multiWebhookWaitCall.received, false)))
                .returning();
            if (!updatedCall) {
                return null; // Already received or doesn't exist
            }
            // Atomically increment the parent counter (same transaction)
            const [updatedWait] = await tx
                .update(multi_webhook_wait_1.multiWebhookWait)
                .set({
                totalReceived: (0, drizzle_orm_1.sql) `${multi_webhook_wait_1.multiWebhookWait.totalReceived} + 1`,
                updatedAt: now,
            })
                .where((0, drizzle_orm_1.eq)(multi_webhook_wait_1.multiWebhookWait.executionId, executionId))
                .returning();
            return updatedWait ?? null;
        });
    }
    /** Deletes the wait group and all its calls (cascade). Returns the deleted parent or null. */
    async deleteWait(executionId) {
        const [row] = await this.db
            .delete(multi_webhook_wait_1.multiWebhookWait)
            .where((0, drizzle_orm_1.eq)(multi_webhook_wait_1.multiWebhookWait.executionId, executionId))
            .returning();
        return row ?? null;
    }
}
exports.MultiWebhookWaitRepository = MultiWebhookWaitRepository;
