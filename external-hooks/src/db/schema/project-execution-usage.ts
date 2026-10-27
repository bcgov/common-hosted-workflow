import { sql } from 'drizzle-orm';
import { check, integer, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';

export const projectExecutionUsage = pgTable(
  'project_execution_usage',
  {
    projectId: varchar('project_id', { length: 50 }).notNull(),
    periodType: varchar('period_type', { length: 10 }).notNull(),
    periodKey: varchar('period_key', { length: 10 }).notNull(),
    count: integer('count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'pk_project_execution_usage', columns: [table.projectId, table.periodType, table.periodKey] }),
    check('chk_peu_period_type', sql`${table.periodType} IN ('weekly', 'yearly')`),
  ],
);

export type ProjectExecutionUsage = typeof projectExecutionUsage.$inferSelect;
export type NewProjectExecutionUsage = typeof projectExecutionUsage.$inferInsert;
