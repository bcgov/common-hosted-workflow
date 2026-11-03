import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const projectRateLimit = pgTable(
  'project_rate_limit',
  {
    projectId: varchar('project_id', { length: 50 }).primaryKey(),
    /**
     * False = the row's weekly/yearly values are the project's custom limits;
     * true = the project follows its scope's saved defaults and the row's
     * limit values are inert (the write path stores nulls for them).
     */
    usesDefaultLimits: boolean('uses_default_limits').notNull().default(true),
    weeklyRateLimit: integer('weekly_rate_limit'),
    yearlyRateLimit: integer('yearly_rate_limit'),
    lastAdminComment: text('last_admin_comment'),
    stopBehavior: varchar('stop_behavior', { length: 20 }).notNull().default('hard_stop'),
    updatedBy: varchar('updated_by', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check('chk_prl_stop_behavior', sql`${table.stopBehavior} IN ('hard_stop', 'soft_stop')`)],
);

export type ProjectRateLimit = typeof projectRateLimit.$inferSelect;
export type NewProjectRateLimit = typeof projectRateLimit.$inferInsert;
