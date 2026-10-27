import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const projectRateLimit = pgTable(
  'project_rate_limit',
  {
    projectId: varchar('project_id', { length: 50 }).primaryKey(),
    weeklyRateLimit: integer('weekly_rate_limit'),
    yearlyRateLimit: integer('yearly_rate_limit'),
    lastAdminComment: text('last_admin_comment'),
    stopBehavior: varchar('stop_behavior', { length: 20 }).notNull().default('hard_stop'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check('chk_prl_stop_behavior', sql`${table.stopBehavior} IN ('hard_stop', 'soft_stop')`)],
);

export type ProjectRateLimit = typeof projectRateLimit.$inferSelect;
export type NewProjectRateLimit = typeof projectRateLimit.$inferInsert;
