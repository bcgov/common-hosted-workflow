"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chefsSubmissionWebhook = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.chefsSubmissionWebhook = (0, pg_core_1.pgTable)('chefs_submission_webhook', {
    executionId: (0, pg_core_1.varchar)('execution_id', { length: 50 }).notNull(),
    webhookUrl: (0, pg_core_1.text)('webhook_url').notNull(),
    formId: (0, pg_core_1.varchar)('form_id', { length: 255 }).notNull(),
    submissionId: (0, pg_core_1.varchar)('submission_id', { length: 255 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.primaryKey)({ name: 'pk_chefs_submission_webhook', columns: [table.formId, table.submissionId] }),
    (0, pg_core_1.index)('idx_chefs_submission_webhook_pending').on(table.formId, table.submissionId),
]);
