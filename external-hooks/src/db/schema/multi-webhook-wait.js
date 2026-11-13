"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.multiWebhookWaitCall = exports.multiWebhookWait = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
/**
 * Tracks an n8n execution waiting for multiple webhook callbacks before resuming.
 * One row per waiting execution — keyed by execution_id.
 */
exports.multiWebhookWait = (0, pg_core_1.pgTable)('multi_webhook_wait', {
    executionId: (0, pg_core_1.varchar)('execution_id', { length: 50 }).primaryKey(),
    resumeUrl: (0, pg_core_1.text)('resume_url').notNull(),
    totalExpected: (0, pg_core_1.integer)('total_expected').notNull(),
    totalReceived: (0, pg_core_1.integer)('total_received').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
/**
 * Each expected callback for a multi-webhook wait.
 * Tracks whether it has been received, when, and what payload it carried.
 */
exports.multiWebhookWaitCall = (0, pg_core_1.pgTable)('multi_webhook_wait_call', {
    executionId: (0, pg_core_1.varchar)('execution_id', { length: 50 }).notNull(),
    matchKey: (0, pg_core_1.varchar)('match_key', { length: 500 }).notNull(),
    received: (0, pg_core_1.boolean)('received').notNull().default(false),
    receivedAt: (0, pg_core_1.timestamp)('received_at', { withTimezone: true }),
    payload: (0, pg_core_1.jsonb)('payload'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.primaryKey)({ name: 'pk_multi_webhook_wait_call', columns: [table.executionId, table.matchKey] }),
    (0, pg_core_1.foreignKey)({
        name: 'fk_multi_webhook_wait_call_execution',
        columns: [table.executionId],
        foreignColumns: [exports.multiWebhookWait.executionId],
    }).onDelete('cascade'),
]);
