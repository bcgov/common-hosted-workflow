import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

/** What the requester is asking for: a one-week top-up or a lasting limit raise. */
export const RUN_REQUEST_KINDS = ['extra_runs', 'limit_increase'] as const;

export type RunRequestKind = (typeof RUN_REQUEST_KINDS)[number];

/** Lifecycle of a run request. `pending` rows are the single in-review request per project. */
export const RUN_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

export type RunRequestStatus = (typeof RUN_REQUEST_STATUSES)[number];

/**
 * Member "Request more runs" submissions awaiting a platform-admin decision.
 * One pending request per project at a time (partial unique index on
 * `project_id` where `status = 'pending'`), so the project detail page shows
 * at most one review panel and a second submit fails instead of queueing.
 * Approved top-up requests are later fulfilled as project top-ups; approved
 * limit raises as custom limits (fulfillment flow ships separately).
 */
export const rateLimitRequest = pgTable(
  'rate_limit_request',
  {
    id: uuid('id').notNull().primaryKey().defaultRandom(),
    projectId: varchar('project_id', { length: 50 }).notNull(),
    requestKind: varchar('request_kind', { length: 30 }).notNull(),
    /** Requested one-off runs (extra_runs kind only). */
    extraRuns: integer('extra_runs'),
    /** Target week of the extra runs, 'YYYY-Www' (extra_runs kind only). */
    periodKey: varchar('period_key', { length: 10 }),
    /** Proposed weekly limit (limit_increase kind; null = leave unchanged). */
    requestedWeeklyLimit: integer('requested_weekly_limit'),
    /** Proposed annual limit (limit_increase kind; null = leave unchanged). */
    requestedAnnualLimit: integer('requested_annual_limit'),
    /** Free-text justification shown to the reviewing admin. */
    reason: varchar('reason', { length: 500 }).notNull(),
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    /** n8n user id of the requesting member. */
    requestedBy: varchar('requested_by', { length: 36 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_rlr_pending_project').on(table.projectId).where(sql`${table.status} = 'pending'`),
    index('idx_rlr_project_created').on(table.projectId, table.createdAt),
    check('chk_rlr_kind', sql`${table.requestKind} IN ('extra_runs', 'limit_increase')`),
    check('chk_rlr_status', sql`${table.status} IN ('pending', 'approved', 'rejected', 'cancelled')`),
    check('chk_rlr_period_key', sql`${table.periodKey} ~ '^([0-9]{4}-W[0-9]{2}|[0-9]{4})$'`),
    check('chk_rlr_extra_runs_non_negative', sql`${table.extraRuns} >= 0`),
    check('chk_rlr_limits_positive', sql`${table.requestedWeeklyLimit} >= 1 AND ${table.requestedAnnualLimit} >= 1`),
    check('chk_rlr_reason_non_empty', sql`length(${table.reason}) >= 1`),
  ],
);

export type RateLimitRequest = typeof rateLimitRequest.$inferSelect;
export type NewRateLimitRequest = typeof rateLimitRequest.$inferInsert;
