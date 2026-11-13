'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.projectExecutionUsage = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const pg_core_1 = require('drizzle-orm/pg-core');
exports.projectExecutionUsage = (0, pg_core_1.pgTable)(
  'project_execution_usage',
  {
    projectId: (0, pg_core_1.varchar)('project_id', { length: 50 }).notNull(),
    periodType: (0, pg_core_1.varchar)('period_type', { length: 10 }).notNull(),
    periodKey: (0, pg_core_1.varchar)('period_key', { length: 10 }).notNull(),
    count: (0, pg_core_1.integer)('count').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    (0, pg_core_1.primaryKey)({
      name: 'pk_project_execution_usage',
      columns: [table.projectId, table.periodType, table.periodKey],
    }),
    (0, pg_core_1.check)('chk_peu_period_type', (0, drizzle_orm_1.sql)`${table.periodType} IN ('weekly', 'yearly')`),
  ],
);
