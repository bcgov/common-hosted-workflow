'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.projectRateLimit = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const pg_core_1 = require('drizzle-orm/pg-core');
exports.projectRateLimit = (0, pg_core_1.pgTable)(
  'project_rate_limit',
  {
    projectId: (0, pg_core_1.varchar)('project_id', { length: 50 }).primaryKey(),
    /**
     * False = the row's weekly/yearly values are the project's custom limits;
     * true = the project follows its scope's saved defaults and the row's
     * limit values are inert (the write path stores nulls for them).
     */
    usesDefaultLimits: (0, pg_core_1.boolean)('uses_default_limits').notNull().default(true),
    weeklyRateLimit: (0, pg_core_1.integer)('weekly_rate_limit'),
    yearlyRateLimit: (0, pg_core_1.integer)('yearly_rate_limit'),
    lastAdminComment: (0, pg_core_1.text)('last_admin_comment'),
    stopBehavior: (0, pg_core_1.varchar)('stop_behavior', { length: 20 }).notNull().default('hard_stop'),
    updatedBy: (0, pg_core_1.varchar)('updated_by', { length: 255 }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    (0, pg_core_1.check)(
      'chk_prl_stop_behavior',
      (0, drizzle_orm_1.sql)`${table.stopBehavior} IN ('hard_stop', 'soft_stop')`,
    ),
  ],
);
