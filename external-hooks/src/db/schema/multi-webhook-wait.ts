import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Tracks an n8n execution waiting for multiple webhook callbacks before resuming.
 * One row per waiting execution — keyed by execution_id.
 */
export const multiWebhookWait = pgTable('multi_webhook_wait', {
  executionId: varchar('execution_id', { length: 50 }).primaryKey(),
  resumeUrl: text('resume_url').notNull(),
  totalExpected: integer('total_expected').notNull(),
  totalReceived: integer('total_received').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Each expected callback for a multi-webhook wait.
 * Tracks whether it has been received, when, and what payload it carried.
 */
export const multiWebhookWaitCall = pgTable(
  'multi_webhook_wait_call',
  {
    executionId: varchar('execution_id', { length: 50 }).notNull(),
    matchKey: varchar('match_key', { length: 500 }).notNull(),
    received: boolean('received').notNull().default(false),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_multi_webhook_wait_call', columns: [table.executionId, table.matchKey] }),
    foreignKey({
      name: 'fk_multi_webhook_wait_call_execution',
      columns: [table.executionId],
      foreignColumns: [multiWebhookWait.executionId],
    }).onDelete('cascade'),
  ],
);

export type MultiWebhookWait = typeof multiWebhookWait.$inferSelect;
export type NewMultiWebhookWait = typeof multiWebhookWait.$inferInsert;
export type MultiWebhookWaitCall = typeof multiWebhookWaitCall.$inferSelect;
export type NewMultiWebhookWaitCall = typeof multiWebhookWaitCall.$inferInsert;
