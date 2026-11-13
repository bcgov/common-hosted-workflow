"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userWorkflow = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.userWorkflow = (0, pg_core_1.pgTable)('user_workflow', {
    id: (0, pg_core_1.integer)().primaryKey().generatedAlwaysAsIdentity(),
    username: (0, pg_core_1.varchar)('username', { length: 255 }).notNull(),
    workflowId: (0, pg_core_1.varchar)('workflow_id', { length: 255 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull().default(''),
    lastUpdated: (0, pg_core_1.timestamp)('last_updated', { withTimezone: true })
        .defaultNow()
        .notNull()
        .$onUpdate(() => new Date()),
    nextFormId: (0, pg_core_1.varchar)('next_form_id', { length: 255 }),
}, (table) => {
    return {};
});
