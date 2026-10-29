import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, primaryKey, timestamp, varchar } from 'drizzle-orm/pg-core';

export const workflowExecutionUsage = pgTable(
  'workflow_execution_usage',
  {
    projectId: varchar('project_id', { length: 50 }).notNull(),
    workflowId: varchar('workflow_id', { length: 50 }).notNull(),
    periodType: varchar('period_type', { length: 10 }).notNull(),
    periodKey: varchar('period_key', { length: 10 }).notNull(),
    count: integer('count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'pk_workflow_execution_usage',
      columns: [table.projectId, table.workflowId, table.periodType, table.periodKey],
    }),
    index('idx_weu_workflow_id').on(table.workflowId),
    check('chk_weu_period_type', sql`${table.periodType} IN ('weekly', 'yearly')`),
  ],
);

export type WorkflowExecutionUsage = typeof workflowExecutionUsage.$inferSelect;
export type NewWorkflowExecutionUsage = typeof workflowExecutionUsage.$inferInsert;
