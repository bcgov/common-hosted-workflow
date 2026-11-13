'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.rateLimitNotification = exports.RATE_LIMIT_NOTIFICATION_KINDS = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const pg_core_1 = require('drizzle-orm/pg-core');
/**
 * Event kinds recorded in `rate_limit_notification`. Enforcement-time events
 * only: each row is a send-once claim for one notification about one period,
 * so a breach detected on every run emails the project exactly once per
 * period and kind.
 */
exports.RATE_LIMIT_NOTIFICATION_KINDS = [
  'weekly_near_50',
  'weekly_near_80',
  'weekly_reached_soft',
  'weekly_reached_hard',
  'yearly_near_50',
  'yearly_near_80',
  'yearly_reached_soft',
  'yearly_reached_hard',
];
/**
 * Rate-limit notification claims: one row per (project, period, event kind).
 * The unique constraint backs claim-by-insert — concurrent runs race on the
 * insert and only the winner sends the email. Rows double as the record of
 * which notifications were sent; old rows are pruned by `created_at`.
 * `period_key` follows the weekly ('YYYY-Www') or yearly ('YYYY') format
 * (see api/helpers/period.ts).
 */
exports.rateLimitNotification = (0, pg_core_1.pgTable)(
  'rate_limit_notification',
  {
    id: (0, pg_core_1.uuid)('id').notNull().primaryKey().defaultRandom(),
    projectId: (0, pg_core_1.varchar)('project_id', { length: 50 }).notNull(),
    periodKey: (0, pg_core_1.varchar)('period_key', { length: 10 }).notNull(),
    eventKind: (0, pg_core_1.varchar)('event_kind', { length: 30 }).notNull(),
    usageCount: (0, pg_core_1.integer)('usage_count').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    (0, pg_core_1.unique)('uq_rln_project_period_kind').on(table.projectId, table.periodKey, table.eventKind),
    (0, pg_core_1.check)(
      'chk_rln_period_key',
      (0, drizzle_orm_1.sql)`${table.periodKey} ~ '^([0-9]{4}-W[0-9]{2}|[0-9]{4})$'`,
    ),
    (0, pg_core_1.check)(
      'chk_rln_event_kind',
      (0,
      drizzle_orm_1.sql)`${table.eventKind} IN ('weekly_near_50', 'weekly_near_80', 'weekly_reached_soft', 'weekly_reached_hard', 'yearly_near_50', 'yearly_near_80', 'yearly_reached_soft', 'yearly_reached_hard')`,
    ),
    (0, pg_core_1.check)('chk_rln_usage_non_negative', (0, drizzle_orm_1.sql)`${table.usageCount} >= 0`),
    (0, pg_core_1.index)('idx_rln_created_at').on(table.createdAt),
  ],
);
