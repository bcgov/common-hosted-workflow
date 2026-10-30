import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Per-project weekly limit top-ups: one-off additions to a project's weekly
 * execution limit for a single ISO week. Several top-ups may target the same
 * week; enforcement sums them. `period_key` follows the weekly period-key
 * format 'YYYY-Www' (see api/helpers/period.ts) and `admin_comment` documents
 * why the top-up was granted, acting as its audit trail.
 */
export const projectTopup = pgTable(
  'project_topup',
  {
    id: uuid('id').notNull().primaryKey().defaultRandom(),
    projectId: varchar('project_id', { length: 50 }).notNull(),
    periodKey: varchar('period_key', { length: 10 }).notNull(),
    amount: integer('amount').notNull(),
    adminComment: text('admin_comment').notNull(),
    createdBy: varchar('created_by', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('chk_ptu_amount_positive', sql`${table.amount} > 0`),
    check('chk_ptu_period_key', sql`${table.periodKey} ~ '^[0-9]{4}-W[0-9]{2}$'`),
    index('idx_ptu_project_period').on(table.projectId, table.periodKey),
  ],
);

export type ProjectTopup = typeof projectTopup.$inferSelect;
export type NewProjectTopup = typeof projectTopup.$inferInsert;
