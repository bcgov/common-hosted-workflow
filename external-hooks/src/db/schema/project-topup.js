"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectTopup = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
/**
 * Per-project weekly limit top-ups: one-off additions to a project's weekly
 * execution limit for a single ISO week. Several top-ups may target the same
 * week; enforcement sums them. `period_key` follows the weekly period-key
 * format 'YYYY-Www' (see api/helpers/period.ts) and `admin_comment` documents
 * why the top-up was granted, acting as its audit trail.
 */
exports.projectTopup = (0, pg_core_1.pgTable)('project_topup', {
    id: (0, pg_core_1.uuid)('id').notNull().primaryKey().defaultRandom(),
    projectId: (0, pg_core_1.varchar)('project_id', { length: 50 }).notNull(),
    periodKey: (0, pg_core_1.varchar)('period_key', { length: 10 }).notNull(),
    amount: (0, pg_core_1.integer)('amount').notNull(),
    adminComment: (0, pg_core_1.text)('admin_comment').notNull(),
    createdBy: (0, pg_core_1.varchar)('created_by', { length: 255 }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.check)('chk_ptu_amount_positive', (0, drizzle_orm_1.sql) `${table.amount} > 0`),
    (0, pg_core_1.check)('chk_ptu_period_key', (0, drizzle_orm_1.sql) `${table.periodKey} ~ '^[0-9]{4}-W[0-9]{2}$'`),
    (0, pg_core_1.index)('idx_ptu_project_period').on(table.projectId, table.periodKey),
]);
