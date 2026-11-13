'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.rateLimitRequest = exports.RUN_REQUEST_STATUSES = exports.RUN_REQUEST_KINDS = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const pg_core_1 = require('drizzle-orm/pg-core');
/** What the requester is asking for: a one-week top-up or a lasting limit raise. */
exports.RUN_REQUEST_KINDS = ['extra_runs', 'limit_increase'];
/** Lifecycle of a run request. `pending` rows are the single in-review request per project. */
exports.RUN_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
/**
 * Member "Request more runs" submissions awaiting a platform-admin decision.
 * One pending request per project at a time (partial unique index on
 * `project_id` where `status = 'pending'`), so the project detail page shows
 * at most one review panel and a second submit fails instead of queueing.
 * Approved top-up requests are later fulfilled as project top-ups; approved
 * limit raises as custom limits (fulfillment flow ships separately).
 */
exports.rateLimitRequest = (0, pg_core_1.pgTable)(
  'rate_limit_request',
  {
    id: (0, pg_core_1.uuid)('id').notNull().primaryKey().defaultRandom(),
    projectId: (0, pg_core_1.varchar)('project_id', { length: 50 }).notNull(),
    requestKind: (0, pg_core_1.varchar)('request_kind', { length: 30 }).notNull(),
    /** Requested one-off runs (extra_runs kind only). */
    extraRuns: (0, pg_core_1.integer)('extra_runs'),
    /** Target week of the extra runs, 'YYYY-Www' (extra_runs kind only). */
    periodKey: (0, pg_core_1.varchar)('period_key', { length: 10 }),
    /** Proposed weekly limit (limit_increase kind; null = leave unchanged). */
    requestedWeeklyLimit: (0, pg_core_1.integer)('requested_weekly_limit'),
    /** Proposed annual limit (limit_increase kind; null = leave unchanged). */
    requestedAnnualLimit: (0, pg_core_1.integer)('requested_annual_limit'),
    /** Free-text justification shown to the reviewing admin. */
    reason: (0, pg_core_1.varchar)('reason', { length: 500 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('pending').notNull(),
    /** n8n user id of the requesting member. */
    requestedBy: (0, pg_core_1.varchar)('requested_by', { length: 36 }).notNull(),
    /** Granted one-off runs (approved extra_runs kind; the reviewing admin may lower the ask). */
    grantedRuns: (0, pg_core_1.integer)('granted_runs'),
    /** Decided weekly limit (approved limit_increase kind). */
    decidedWeeklyLimit: (0, pg_core_1.integer)('decided_weekly_limit'),
    /** Decided annual limit (approved limit_increase kind). */
    decidedAnnualLimit: (0, pg_core_1.integer)('decided_annual_limit'),
    /** The admin's note on approval / the required deny reason. */
    decisionNote: (0, pg_core_1.varchar)('decision_note', { length: 500 }),
    /** Platform-admin email of the decider (same convention as topup.created_by). */
    decidedBy: (0, pg_core_1.varchar)('decided_by', { length: 255 }),
    decidedAt: (0, pg_core_1.timestamp)('decided_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    (0, pg_core_1.uniqueIndex)('uq_rlr_pending_project')
      .on(table.projectId)
      .where((0, drizzle_orm_1.sql)`${table.status} = 'pending'`),
    (0, pg_core_1.index)('idx_rlr_project_created').on(table.projectId, table.createdAt),
    (0, pg_core_1.check)(
      'chk_rlr_kind',
      (0, drizzle_orm_1.sql)`${table.requestKind} IN ('extra_runs', 'limit_increase')`,
    ),
    (0, pg_core_1.check)(
      'chk_rlr_status',
      (0, drizzle_orm_1.sql)`${table.status} IN ('pending', 'approved', 'rejected', 'cancelled')`,
    ),
    (0, pg_core_1.check)(
      'chk_rlr_period_key',
      (0, drizzle_orm_1.sql)`${table.periodKey} ~ '^([0-9]{4}-W[0-9]{2}|[0-9]{4})$'`,
    ),
    (0, pg_core_1.check)('chk_rlr_extra_runs_non_negative', (0, drizzle_orm_1.sql)`${table.extraRuns} >= 0`),
    (0, pg_core_1.check)(
      'chk_rlr_limits_positive',
      (0, drizzle_orm_1.sql)`${table.requestedWeeklyLimit} >= 1 AND ${table.requestedAnnualLimit} >= 1`,
    ),
    (0, pg_core_1.check)('chk_rlr_reason_non_empty', (0, drizzle_orm_1.sql)`length(${table.reason}) >= 1`),
    (0, pg_core_1.check)('chk_rlr_granted_runs_positive', (0, drizzle_orm_1.sql)`${table.grantedRuns} >= 1`),
    (0, pg_core_1.check)(
      'chk_rlr_decided_limits_positive',
      (0, drizzle_orm_1.sql)`${table.decidedWeeklyLimit} >= 1 AND ${table.decidedAnnualLimit} >= 1`,
    ),
  ],
);
