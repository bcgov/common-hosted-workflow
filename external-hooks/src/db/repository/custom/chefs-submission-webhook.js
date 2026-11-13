"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChefsSubmissionWebhookRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const chefs_submission_webhook_1 = require("../../schema/chefs-submission-webhook");
class ChefsSubmissionWebhookRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Returns the pending row for a form/submission pair, or null if none exists. */
    async getPendingByFormAndSubmission(params) {
        const [row] = await this.db
            .select()
            .from(chefs_submission_webhook_1.chefsSubmissionWebhook)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(chefs_submission_webhook_1.chefsSubmissionWebhook.formId, params.formId), (0, drizzle_orm_1.eq)(chefs_submission_webhook_1.chefsSubmissionWebhook.submissionId, params.submissionId)))
            .limit(1);
        return row ?? null;
    }
    /** Deletes the row for a form/submission pair once resolved. Returns the deleted row or null. */
    async deleteRow(params) {
        const [row] = await this.db
            .delete(chefs_submission_webhook_1.chefsSubmissionWebhook)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(chefs_submission_webhook_1.chefsSubmissionWebhook.formId, params.formId), (0, drizzle_orm_1.eq)(chefs_submission_webhook_1.chefsSubmissionWebhook.submissionId, params.submissionId)))
            .returning();
        return row ?? null;
    }
    /**
     * Inserts a new pending row, or — on conflict of the (form_id, submission_id) key —
     * refreshes execution_id and webhook_url so the latest Wait caller wins.
     */
    async upsertPending(params) {
        const now = new Date();
        const [row] = await this.db
            .insert(chefs_submission_webhook_1.chefsSubmissionWebhook)
            .values({
            executionId: params.executionId,
            formId: params.formId,
            submissionId: params.submissionId,
            webhookUrl: params.webhookUrl,
            createdAt: now,
            updatedAt: now,
        })
            .onConflictDoUpdate({
            target: [chefs_submission_webhook_1.chefsSubmissionWebhook.formId, chefs_submission_webhook_1.chefsSubmissionWebhook.submissionId],
            set: {
                executionId: params.executionId,
                webhookUrl: params.webhookUrl,
                updatedAt: now,
            },
        })
            .returning();
        return row;
    }
}
exports.ChefsSubmissionWebhookRepository = ChefsSubmissionWebhookRepository;
