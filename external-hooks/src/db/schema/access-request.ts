import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const accessRequest = pgTable(
  'access_request',
  {
    id: uuid('id').notNull().primaryKey().defaultRandom(),
    requesterEmail: varchar('requester_email', { length: 255 }).notNull(),
    justification: text('justification').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    reviewerEmail: varchar('reviewer_email', { length: 255 }),
    reviewerN8nUserId: varchar('reviewer_n8n_user_id', { length: 50 }),
    denyReason: text('deny_reason'),
    metadata: jsonb('metadata'),
  },
  (table) => [
    check('chk_access_request_status', sql`${table.status} IN ('pending', 'approved', 'denied')`),
    uniqueIndex('uq_access_request_pending_requester_email')
      .on(table.requesterEmail)
      .where(sql`${table.status} = 'pending'`),
    index('idx_access_request_status').on(table.status),
    index('idx_access_request_requester_email').on(table.requesterEmail),
    index('idx_access_request_created_at').on(table.createdAt.desc()),
  ],
);

export type AccessRequest = typeof accessRequest.$inferSelect;
export type NewAccessRequest = typeof accessRequest.$inferInsert;
