import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const CREDENTIAL_ENTITY_TYPES = ['chefs_api_key', 'webhook_auth_header'] as const;
export type CredentialEntityType = (typeof CREDENTIAL_ENTITY_TYPES)[number];

export const credentialEntity = pgTable(
  'credential_entity',
  {
    id: uuid('id').notNull().primaryKey().defaultRandom(),
    name: varchar('name', { length: 128 }).notNull(),
    type: varchar('type', { length: 128 }).notNull(),
    data: text('data').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by', { length: 100 }),
    updatedBy: varchar('updated_by', { length: 100 }),
  },
  (table) => [
    check('chk_cred_type', sql`${table.type} IN ('chefs_api_key', 'webhook_auth_header')`),
    index('idx_ce_type').on(table.type),
  ],
);

export type CredentialEntity = typeof credentialEntity.$inferSelect;
export type NewCredentialEntity = typeof credentialEntity.$inferInsert;
