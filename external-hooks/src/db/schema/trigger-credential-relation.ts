import { index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { credentialEntity } from './credential-entity';
import { workflowTrigger } from './workflow-trigger';

export const triggerCredentialRelation = pgTable(
  'trigger_credential_relation',
  {
    triggerId: uuid('trigger_id')
      .notNull()
      .references(() => workflowTrigger.id, { onDelete: 'cascade' }),
    credentialId: uuid('credential_id')
      .notNull()
      .references(() => credentialEntity.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.triggerId, table.credentialId] }),
    index('idx_tcr_trigger_id').on(table.triggerId),
    index('idx_tcr_credential_id').on(table.credentialId),
  ],
);

export type TriggerCredentialRelation = typeof triggerCredentialRelation.$inferSelect;
export type NewTriggerCredentialRelation = typeof triggerCredentialRelation.$inferInsert;
