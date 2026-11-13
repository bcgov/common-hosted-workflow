'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.auditLog = exports.actionRequest = exports.message = exports.tenantProjectRelation = void 0;
const drizzle_orm_1 = require('drizzle-orm');
const pg_core_1 = require('drizzle-orm/pg-core');
/**
 * tenant_project_relation
 */
exports.tenantProjectRelation = (0, pg_core_1.pgTable)(
  'tenant_project_relation',
  {
    tenantId: (0, pg_core_1.uuid)('tenant_id').notNull(),
    projectId: (0, pg_core_1.varchar)('project_id', { length: 50 }).notNull(),
    projectType: (0, pg_core_1.varchar)('project_type', { length: 50 }),
  },
  (table) => [
    (0, pg_core_1.primaryKey)({ columns: [table.tenantId, table.projectId] }),
    (0, pg_core_1.index)('idx_tpr_tenant_id').on(table.tenantId),
    (0, pg_core_1.uniqueIndex)('uq_tpr_project_id').on(table.projectId),
  ],
);
/**
 * message
 */
exports.message = (0, pg_core_1.pgTable)(
  'message',
  {
    id: (0, pg_core_1.uuid)('id').notNull().primaryKey().defaultRandom(),
    title: (0, pg_core_1.varchar)('title', { length: 255 }).notNull(),
    body: (0, pg_core_1.text)('body').notNull(),
    actorId: (0, pg_core_1.varchar)('actor_id', { length: 50 }).notNull(),
    actorType: (0, pg_core_1.varchar)('actor_type', { length: 50 }).notNull(),
    workflowInstanceId: (0, pg_core_1.varchar)('workflow_instance_id', {
      length: 50,
    }).notNull(),
    workflowId: (0, pg_core_1.varchar)('workflow_id', { length: 50 }),
    projectId: (0, pg_core_1.varchar)('project_id', {
      length: 50,
    })
      .notNull()
      .references(() => exports.tenantProjectRelation.projectId),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default('active'),
    metadata: (0, pg_core_1.jsonb)('metadata'),
  },
  (table) => [
    (0, pg_core_1.check)('chk_message_status', (0, drizzle_orm_1.sql)`${table.status} IN ('active', 'read')`),
    (0, pg_core_1.check)(
      'chk_message_actor_type',
      (0, drizzle_orm_1.sql)`${table.actorType} IN ('user', 'role', 'group', 'system', 'other')`,
    ),
    (0, pg_core_1.index)('idx_message_project_created').on(table.projectId, table.createdAt.desc()),
    (0, pg_core_1.index)('idx_message_project_actor_created').on(
      table.projectId,
      table.actorId,
      table.createdAt.desc(),
    ),
    (0, pg_core_1.index)('idx_message_project_actor_id').on(table.projectId, table.actorId, table.id),
    (0, pg_core_1.index)('idx_message_instance_created').on(table.workflowInstanceId, table.createdAt.desc()),
    (0, pg_core_1.index)('idx_message_status').on(table.status),
    (0, pg_core_1.index)('idx_message_since')
      .on(table.projectId, table.actorId, table.createdAt.desc())
      .where((0, drizzle_orm_1.sql)`${table.status} = 'active'`),
  ],
);
/**
 * action_request
 */
exports.actionRequest = (0, pg_core_1.pgTable)(
  'action_request',
  {
    id: (0, pg_core_1.uuid)('id').notNull().primaryKey().defaultRandom(),
    actionType: (0, pg_core_1.varchar)('action_type', { length: 100 }).notNull(),
    payload: (0, pg_core_1.jsonb)('payload').notNull(),
    callbackUrl: (0, pg_core_1.text)('callback_url').notNull(),
    callbackMethod: (0, pg_core_1.varchar)('callback_method', { length: 10 }).notNull().default('POST'),
    callbackPayloadSpec: (0, pg_core_1.jsonb)('callback_payload_spec'),
    actorId: (0, pg_core_1.varchar)('actor_id', { length: 50 }).notNull(),
    actorType: (0, pg_core_1.varchar)('actor_type', { length: 50 }).notNull(),
    workflowInstanceId: (0, pg_core_1.varchar)('workflow_instance_id', {
      length: 50,
    }).notNull(),
    workflowId: (0, pg_core_1.varchar)('workflow_id', { length: 50 }),
    projectId: (0, pg_core_1.varchar)('project_id', {
      length: 50,
    })
      .notNull()
      .references(() => exports.tenantProjectRelation.projectId),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default('pending'),
    actionTitle: (0, pg_core_1.varchar)('action_title', { length: 255 }),
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).notNull().default('normal'),
    dueDate: (0, pg_core_1.timestamp)('due_date', { withTimezone: true }),
    checkIn: (0, pg_core_1.timestamp)('check_in', { withTimezone: true }),
    claimedBy: (0, pg_core_1.varchar)('claimed_by', { length: 255 }),
    claimedAt: (0, pg_core_1.timestamp)('claimed_at', { withTimezone: true }),
    completedBy: (0, pg_core_1.varchar)('completed_by', { length: 255 }),
    completedAt: (0, pg_core_1.timestamp)('completed_at', { withTimezone: true }),
    metadata: (0, pg_core_1.jsonb)('metadata'),
  },
  (table) => [
    (0, pg_core_1.check)(
      'chk_action_request_status',
      (0,
      drizzle_orm_1.sql)`${table.status} IN ('pending', 'claimed', 'in_progress', 'completed', 'cancelled', 'expired', 'deleted')`,
    ),
    (0, pg_core_1.check)('chk_ar_priority', (0, drizzle_orm_1.sql)`${table.priority} IN ('critical', 'normal')`),
    (0, pg_core_1.check)(
      'chk_ar_actor_type',
      (0, drizzle_orm_1.sql)`${table.actorType} IN ('user', 'role', 'group', 'system', 'other')`,
    ),
    (0, pg_core_1.index)('idx_ar_project_created').on(table.projectId, table.createdAt.desc()),
    (0, pg_core_1.index)('idx_ar_project_actor_created').on(table.projectId, table.actorId, table.createdAt.desc()),
    (0, pg_core_1.index)('idx_ar_project_actor_workflow_created').on(
      table.projectId,
      table.actorId,
      table.workflowId,
      table.createdAt.desc(),
    ),
    (0, pg_core_1.index)('idx_ar_project_id').on(table.projectId, table.id),
    (0, pg_core_1.index)('idx_ar_project_actor_id').on(table.projectId, table.actorId, table.id),
    (0, pg_core_1.index)('idx_ar_instance_created').on(table.workflowInstanceId, table.createdAt.desc()),
    (0, pg_core_1.index)('idx_ar_status').on(table.status),
    (0, pg_core_1.index)('idx_ar_due_date')
      .on(table.dueDate)
      .where((0, drizzle_orm_1.sql)`${table.status} = 'pending'`),
    (0, pg_core_1.index)('idx_ar_priority_status').on(table.priority, table.status),
    (0, pg_core_1.index)('idx_ar_check_in')
      .on(table.checkIn)
      .where((0, drizzle_orm_1.sql)`${table.checkIn} IS NOT NULL`),
    (0, pg_core_1.index)('idx_ar_pending_claims')
      .on(table.id, table.status)
      .where((0, drizzle_orm_1.sql)`${table.status} = 'pending'`),
  ],
);
/**
 * audit_log
 */
exports.auditLog = (0, pg_core_1.pgTable)(
  'audit_log',
  {
    id: (0, pg_core_1.uuid)('id').notNull().primaryKey().defaultRandom(),
    entityType: (0, pg_core_1.varchar)('entity_type', { length: 100 }).notNull(),
    entityId: (0, pg_core_1.uuid)('entity_id').notNull(),
    action: (0, pg_core_1.varchar)('action', { length: 50 }).notNull(),
    projectId: (0, pg_core_1.varchar)('project_id', {
      length: 50,
    })
      .notNull()
      .references(() => exports.tenantProjectRelation.projectId),
    performedBy: (0, pg_core_1.varchar)('performed_by', { length: 100 }).notNull(),
    performedAt: (0, pg_core_1.timestamp)('performed_at', { withTimezone: true }).defaultNow().notNull(),
    beforeState: (0, pg_core_1.jsonb)('before_state'),
    afterState: (0, pg_core_1.jsonb)('after_state'),
    metadata: (0, pg_core_1.jsonb)('metadata'),
  },
  (table) => [
    (0, pg_core_1.check)(
      'chk_audit_action',
      (0,
      drizzle_orm_1.sql)`${table.action} IN ('created', 'updated', 'archived', 'deleted', 'status_changed', 'assigned')`,
    ),
    (0, pg_core_1.check)(
      'chk_audit_entity_type',
      (0, drizzle_orm_1.sql)`${table.entityType} IN ('message', 'action_request')`,
    ),
    (0, pg_core_1.index)('idx_audit_project_entity').on(table.projectId, table.entityType, table.entityId),
    (0, pg_core_1.index)('idx_audit_performed_at').on(table.performedAt.desc()),
    (0, pg_core_1.index)('idx_audit_project_performed_by').on(
      table.projectId,
      table.performedBy,
      table.performedAt.desc(),
    ),
  ],
);
