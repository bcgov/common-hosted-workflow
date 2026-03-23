import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * messages
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').notNull().primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    actorId: varchar('actor_id', { length: 50 }).notNull(),
    actorType: varchar('actor_type', { length: 50 }).notNull(),
    workflowInstanceId: varchar('workflow_instance_id', {
      length: 50,
    }).notNull(),
    workflowId: varchar('workflow_id', { length: 50 }),
    projectId: varchar('project_id', {
      length: 50,
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    status: varchar('status', { length: 50 }).notNull().default('active'),
    metadata: jsonb('metadata'),
  },
  (table) => [
    check('chk_messages_status', sql`${table.status} IN ('active', 'read')`),
    check('chk_messages_actor_type', sql`${table.actorType} IN ('user', 'role', 'group', 'system', 'other')`),
    index('idx_messages_project_created').on(table.projectId, table.createdAt.desc()),
    index('idx_messages_project_actor_created').on(table.projectId, table.actorId, table.createdAt.desc()),
    index('idx_messages_project_actor_id').on(table.projectId, table.actorId, table.id),
    index('idx_messages_instance_created').on(table.workflowInstanceId, table.createdAt.desc()),
    index('idx_messages_status').on(table.status),
    index('idx_messages_since')
      .on(table.projectId, table.actorId, table.createdAt.desc())
      .where(sql`${table.status} = 'active'`),
  ],
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

/**
 * action_requests
 */
export const actionRequests = pgTable(
  'action_requests',
  {
    id: uuid('id').notNull().primaryKey().defaultRandom(),
    actionType: varchar('action_type', { length: 100 }).notNull(),
    payload: jsonb('payload').notNull(),
    callbackUrl: text('callback_url').notNull(),
    callbackMethod: varchar('callback_method', { length: 10 }).notNull().default('POST'),
    callbackPayloadSpec: jsonb('callback_payload_spec'),
    actorId: varchar('actor_id', { length: 50 }).notNull(),
    actorType: varchar('actor_type', { length: 50 }).notNull(),
    workflowInstanceId: varchar('workflow_instance_id', {
      length: 50,
    }).notNull(),
    workflowId: varchar('workflow_id', { length: 50 }),
    projectId: varchar('project_id', {
      length: 50,
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    priority: varchar('priority', { length: 20 }).notNull().default('normal'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    checkIn: timestamp('check_in', { withTimezone: true }),
    metadata: jsonb('metadata'),
  },
  (table) => [
    check(
      'chk_ar_status',
      sql`${table.status} IN ('pending', 'in_progress', 'completed', 'cancelled', 'expired', 'deleted')`,
    ),
    check('chk_ar_priority', sql`${table.priority} IN ('critical', 'normal')`),
    check('chk_ar_actor_type', sql`${table.actorType} IN ('user', 'role', 'group', 'system', 'other')`),
    index('idx_ar_project_created').on(table.projectId, table.createdAt.desc()),
    index('idx_ar_project_actor_created').on(table.projectId, table.actorId, table.createdAt.desc()),
    index('idx_ar_project_actor_workflow_created').on(
      table.projectId,
      table.actorId,
      table.workflowId,
      table.createdAt.desc(),
    ),
    index('idx_ar_project_id').on(table.projectId, table.id),
    index('idx_ar_project_actor_id').on(table.projectId, table.actorId, table.id),
    index('idx_ar_instance_created').on(table.workflowInstanceId, table.createdAt.desc()),
    index('idx_ar_status').on(table.status),
    index('idx_ar_due_date')
      .on(table.dueDate)
      .where(sql`${table.status} = 'pending'`),
    index('idx_ar_priority_status').on(table.priority, table.status),
    index('idx_ar_check_in')
      .on(table.checkIn)
      .where(sql`${table.checkIn} IS NOT NULL`),
  ],
);

export type ActionRequest = typeof actionRequests.$inferSelect;
export type NewActionRequest = typeof actionRequests.$inferInsert;

/**
 * audit_log
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').notNull().primaryKey().defaultRandom(),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    projectId: varchar('project_id', {
      length: 50,
    }).notNull(),
    performedBy: varchar('performed_by', { length: 100 }).notNull(),
    performedAt: timestamp('performed_at', { withTimezone: true }).defaultNow().notNull(),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    metadata: jsonb('metadata'),
  },
  (table) => [
    check(
      'chk_audit_action',
      sql`${table.action} IN ('created', 'updated', 'archived', 'deleted', 'status_changed', 'assigned')`,
    ),
    check('chk_audit_entity_type', sql`${table.entityType} IN ('message', 'action_request')`),
    index('idx_audit_project_entity').on(table.projectId, table.entityType, table.entityId),
    index('idx_audit_performed_at').on(table.performedAt.desc()),
    index('idx_audit_project_performed_by').on(table.projectId, table.performedBy, table.performedAt.desc()),
  ],
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
