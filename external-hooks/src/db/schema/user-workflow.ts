import { pgTable, integer, varchar, timestamp, primaryKey } from 'drizzle-orm/pg-core';

export const userWorkflow = pgTable(
  'user_workflow',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    username: varchar('username', { length: 255 }).notNull(),
    workflowId: varchar('workflow_id', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default(''),
    lastUpdated: timestamp('last_updated', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    nextFormId: varchar('next_form_id', { length: 255 }),
  },
  (table) => {
    return {};
  },
);

export type UserWorkflow = typeof userWorkflow.$inferSelect;
export type NewUserWorkflow = typeof userWorkflow.$inferInsert;
