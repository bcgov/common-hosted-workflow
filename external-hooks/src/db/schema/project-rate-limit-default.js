"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectRateLimitDefault = exports.rateLimitScopeKinds = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
/** Project scopes that can carry default rate limits. */
exports.rateLimitScopeKinds = ['team', 'personal'];
/**
 * Per-scope default rate limits (at most one row per kind, ever). A null limit
 * means "no default": projects of that scope without their own limits stay
 * uncapped. Enforcement resolves a project's limits as its own configuration
 * first, then these scope defaults.
 */
exports.projectRateLimitDefault = (0, pg_core_1.pgTable)('project_rate_limit_default', {
    projectKind: (0, pg_core_1.varchar)('project_kind', { length: 10 }).primaryKey(),
    weeklyRateLimit: (0, pg_core_1.integer)('weekly_rate_limit'),
    yearlyRateLimit: (0, pg_core_1.integer)('yearly_rate_limit'),
    updatedBy: (0, pg_core_1.varchar)('updated_by', { length: 255 }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.check)('chk_prld_project_kind', (0, drizzle_orm_1.sql) `${table.projectKind} IN ('team', 'personal')`),
    (0, pg_core_1.check)('chk_prld_weekly_non_negative', (0, drizzle_orm_1.sql) `${table.weeklyRateLimit} IS NULL OR ${table.weeklyRateLimit} >= 0`),
    (0, pg_core_1.check)('chk_prld_yearly_non_negative', (0, drizzle_orm_1.sql) `${table.yearlyRateLimit} IS NULL OR ${table.yearlyRateLimit} >= 0`),
]);
