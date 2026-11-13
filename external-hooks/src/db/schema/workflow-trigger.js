'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.workflowTrigger = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const pg_core_1 = require('drizzle-orm/pg-core');
const workflow_interaction_layer_1 = require('./workflow-interaction-layer');
exports.workflowTrigger = (0, pg_core_1.pgTable)(
  'workflow_trigger',
  {
    id: (0, pg_core_1.uuid)('id').notNull().primaryKey().defaultRandom(),
    projectId: (0, pg_core_1.varchar)('project_id', { length: 50 })
      .notNull()
      .references(() => workflow_interaction_layer_1.tenantProjectRelation.projectId),
    triggerType: (0, pg_core_1.varchar)('trigger_type', { length: 100 }).notNull(),
    /** 'n8n-node' = WIL Trigger node run in-process. The only supported target kind. */
    targetKind: (0, pg_core_1.varchar)('target_kind', { length: 20 }).notNull().default('n8n-node'),
    targetWorkflowId: (0, pg_core_1.varchar)('target_workflow_id', { length: 36 }),
    targetNodeId: (0, pg_core_1.varchar)('target_node_id', { length: 36 }),
    metadata: (0, pg_core_1.jsonb)('metadata').notNull(),
    allowedActorsType: (0, pg_core_1.varchar)('allowed_actors_type', { length: 100 }).notNull(),
    allowedActors: (0, pg_core_1.varchar)('allowed_actors', { length: 50 }).array().notNull(),
    authEnabled: (0, pg_core_1.boolean)('auth_enabled').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: (0, pg_core_1.varchar)('created_by', { length: 100 }),
    updatedBy: (0, pg_core_1.varchar)('updated_by', { length: 100 }),
  },
  (table) => [
    (0, pg_core_1.check)(
      'chk_wt_trigger_type',
      (0, drizzle_orm_1.sql)`${table.triggerType} IN ('chefs-form', 'button')`,
    ),
    (0, pg_core_1.check)('chk_wt_target_kind', (0, drizzle_orm_1.sql)`${table.targetKind} IN ('n8n-node')`),
    (0, pg_core_1.check)(
      'chk_wt_target_shape',
      (0,
      drizzle_orm_1.sql)`${table.targetKind} = 'n8n-node' AND ${table.targetWorkflowId} IS NOT NULL AND ${table.targetNodeId} IS NOT NULL`,
    ),
    (0, pg_core_1.index)('idx_wt_project_id').on(table.projectId),
    (0, pg_core_1.index)('idx_wt_target_workflow').on(table.targetWorkflowId),
  ],
);
