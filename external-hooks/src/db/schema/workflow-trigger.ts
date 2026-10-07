import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenantProjectRelation } from './workflow-interaction-layer';

export const workflowTrigger = pgTable(
  'workflow_trigger',
  {
    id: uuid('id').notNull().primaryKey().defaultRandom(),
    projectId: varchar('project_id', { length: 50 })
      .notNull()
      .references(() => tenantProjectRelation.projectId),
    triggerType: varchar('trigger_type', { length: 100 }).notNull(),
    /** 'url' = legacy outbound webhook; 'n8n-node' = WIL Trigger node run in-process. */
    targetKind: varchar('target_kind', { length: 20 }).notNull().default('url'),
    targetWorkflowId: varchar('target_workflow_id', { length: 36 }),
    targetNodeId: varchar('target_node_id', { length: 36 }),
    triggerUrl: text('trigger_url'),
    triggerMethod: varchar('trigger_method', { length: 50 }),
    metadata: jsonb('metadata').notNull(),
    allowedActorsType: varchar('allowed_actors_type', { length: 100 }).notNull(),
    allowedActors: varchar('allowed_actors', { length: 50 }).array().notNull(),
    authEnabled: boolean('auth_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by', { length: 100 }),
    updatedBy: varchar('updated_by', { length: 100 }),
  },
  (table) => [
    check('chk_wt_trigger_type', sql`${table.triggerType} IN ('chefs-form', 'button')`),
    check('chk_wt_target_kind', sql`${table.targetKind} IN ('url', 'n8n-node')`),
    check(
      'chk_wt_target_shape',
      sql`(${table.targetKind} = 'url' AND ${table.triggerUrl} IS NOT NULL AND ${table.triggerMethod} IS NOT NULL)
        OR (${table.targetKind} = 'n8n-node' AND ${table.targetWorkflowId} IS NOT NULL AND ${table.targetNodeId} IS NOT NULL)`,
    ),
    index('idx_wt_project_id').on(table.projectId),
    index('idx_wt_target_workflow').on(table.targetWorkflowId),
  ],
);

export type WorkflowTrigger = typeof workflowTrigger.$inferSelect;
export type NewWorkflowTrigger = typeof workflowTrigger.$inferInsert;
