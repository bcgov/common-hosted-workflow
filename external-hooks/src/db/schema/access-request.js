"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accessRequest = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
exports.accessRequest = (0, pg_core_1.pgTable)('access_request', {
    id: (0, pg_core_1.uuid)('id').notNull().primaryKey().defaultRandom(),
    requesterEmail: (0, pg_core_1.varchar)('requester_email', { length: 255 }).notNull(),
    justification: (0, pg_core_1.text)('justification').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default('pending'),
    reviewerEmail: (0, pg_core_1.varchar)('reviewer_email', { length: 255 }),
    reviewerN8nUserId: (0, pg_core_1.varchar)('reviewer_n8n_user_id', { length: 50 }),
    denyReason: (0, pg_core_1.text)('deny_reason'),
    metadata: (0, pg_core_1.jsonb)('metadata'),
}, (table) => [
    (0, pg_core_1.check)('chk_access_request_status', (0, drizzle_orm_1.sql) `${table.status} IN ('pending', 'approved', 'denied')`),
    (0, pg_core_1.uniqueIndex)('uq_access_request_pending_requester_email')
        .on(table.requesterEmail)
        .where((0, drizzle_orm_1.sql) `${table.status} = 'pending'`),
    (0, pg_core_1.index)('idx_access_request_status').on(table.status),
    (0, pg_core_1.index)('idx_access_request_requester_email').on(table.requesterEmail),
    (0, pg_core_1.index)('idx_access_request_created_at').on(table.createdAt.desc()),
]);
