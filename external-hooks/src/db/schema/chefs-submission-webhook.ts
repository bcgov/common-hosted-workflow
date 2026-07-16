import { index, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const chefsSubmissionWebhook = pgTable(
  'chefs_submission_webhook',
  {
    executionId: varchar('execution_id', { length: 50 }).notNull(),
    webhookUrl: text('webhook_url').notNull(),
    formId: varchar('form_id', { length: 255 }).notNull(),
    submissionId: varchar('submission_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_chefs_submission_webhook', columns: [table.formId, table.submissionId] }),
    index('idx_chefs_submission_webhook_pending').on(table.formId, table.submissionId),
  ],
);

export type ChefsSubmissionWebhook = typeof chefsSubmissionWebhook.$inferSelect;
export type NewChefsSubmissionWebhook = typeof chefsSubmissionWebhook.$inferInsert;
