import { sql } from 'drizzle-orm';
import { check, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/** Project scopes that can carry default rate limits. */
export const rateLimitScopeKinds = ['team', 'personal'] as const;
export type RateLimitScopeKind = (typeof rateLimitScopeKinds)[number];

/**
 * Per-scope default rate limits (at most one row per kind, ever). A null limit
 * means "no default": projects of that scope without their own limits stay
 * uncapped. Enforcement resolves a project's limits as its own configuration
 * first, then these scope defaults.
 */
export const projectRateLimitDefault = pgTable(
  'project_rate_limit_default',
  {
    projectKind: varchar('project_kind', { length: 10 }).primaryKey(),
    weeklyRateLimit: integer('weekly_rate_limit'),
    yearlyRateLimit: integer('yearly_rate_limit'),
    updatedBy: varchar('updated_by', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('chk_prld_project_kind', sql`${table.projectKind} IN ('team', 'personal')`),
    check('chk_prld_weekly_non_negative', sql`${table.weeklyRateLimit} IS NULL OR ${table.weeklyRateLimit} >= 0`),
    check('chk_prld_yearly_non_negative', sql`${table.yearlyRateLimit} IS NULL OR ${table.yearlyRateLimit} >= 0`),
  ],
);

export type ProjectRateLimitDefault = typeof projectRateLimitDefault.$inferSelect;
export type NewProjectRateLimitDefault = typeof projectRateLimitDefault.$inferInsert;
