import { sql } from 'drizzle-orm';
import { boolean, check, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const workflowTrigger = pgTable(
  'workflow_trigger',
  {
    id: uuid('id').notNull().primaryKey().defaultRandom(),
    triggerType: varchar('trigger_type', { length: 100 }).notNull(),
    triggerUrl: text('trigger_url').notNull(),
    triggerMethod: varchar('trigger_method', { length: 50 }).notNull(),
    metadata: jsonb('metadata').notNull(),
    allowedActorsType: varchar('allowed_actors_type', { length: 100 }).notNull(),
    allowedActors: varchar('allowed_actors', { length: 50 }).array().notNull(),
    authEnabled: boolean('auth_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by', { length: 100 }),
    updatedBy: varchar('updated_by', { length: 100 }),
  },
  (table) => [check('chk_wt_actor_type', sql`${table.triggerType} IN ('chefs', 'button')`)],
);

export type WorkflowTrigger = typeof workflowTrigger.$inferSelect;
export type NewWorkflowTrigger = typeof workflowTrigger.$inferInsert;
