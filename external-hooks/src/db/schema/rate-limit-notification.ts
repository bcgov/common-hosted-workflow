import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Event kinds recorded in `rate_limit_notification`. Enforcement-time events
 * only: each row is a send-once claim for one notification about one period,
 * so a breach detected on every run emails the project exactly once per
 * period and kind.
 */
export const RATE_LIMIT_NOTIFICATION_KINDS = [
  'weekly_near_50',
  'weekly_near_80',
  'weekly_reached_soft',
  'weekly_reached_hard',
  'yearly_near_50',
  'yearly_near_80',
  'yearly_reached_soft',
  'yearly_reached_hard',
] as const;

export type RateLimitNotificationKind = (typeof RATE_LIMIT_NOTIFICATION_KINDS)[number];

/**
 * Rate-limit notification claims: one row per (project, period, event kind).
 * The unique constraint backs claim-by-insert — concurrent runs race on the
 * insert and only the winner sends the email. Rows double as the record of
 * which notifications were sent; old rows are pruned by `created_at`.
 * `period_key` follows the weekly ('YYYY-Www') or yearly ('YYYY') format
 * (see api/helpers/period.ts).
 */
export const rateLimitNotification = pgTable(
  'rate_limit_notification',
  {
    id: uuid('id').notNull().primaryKey().defaultRandom(),
    projectId: varchar('project_id', { length: 50 }).notNull(),
    periodKey: varchar('period_key', { length: 10 }).notNull(),
    eventKind: varchar('event_kind', { length: 30 }).notNull(),
    usageCount: integer('usage_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('uq_rln_project_period_kind').on(table.projectId, table.periodKey, table.eventKind),
    check('chk_rln_period_key', sql`${table.periodKey} ~ '^([0-9]{4}-W[0-9]{2}|[0-9]{4})$'`),
    check(
      'chk_rln_event_kind',
      sql`${table.eventKind} IN ('weekly_near_50', 'weekly_near_80', 'weekly_reached_soft', 'weekly_reached_hard', 'yearly_near_50', 'yearly_near_80', 'yearly_reached_soft', 'yearly_reached_hard')`,
    ),
    check('chk_rln_usage_non_negative', sql`${table.usageCount} >= 0`),
    index('idx_rln_created_at').on(table.createdAt),
  ],
);

export type RateLimitNotification = typeof rateLimitNotification.$inferSelect;
export type NewRateLimitNotification = typeof rateLimitNotification.$inferInsert;
