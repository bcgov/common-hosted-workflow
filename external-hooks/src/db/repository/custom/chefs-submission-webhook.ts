import { and, eq } from 'drizzle-orm';
import { chefsSubmissionWebhook } from '../../schema/chefs-submission-webhook';

export class ChefsSubmissionWebhookRepository {
  constructor(private readonly db: any) {}

  /** Returns the pending row for a form/submission pair, or null if none exists. */
  async getPendingByFormAndSubmission(params: {
    formId: string;
    submissionId: string;
  }): Promise<typeof chefsSubmissionWebhook.$inferSelect | null> {
    const [row] = await this.db
      .select()
      .from(chefsSubmissionWebhook)
      .where(
        and(
          eq(chefsSubmissionWebhook.formId, params.formId),
          eq(chefsSubmissionWebhook.submissionId, params.submissionId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Deletes the row for a form/submission pair once resolved. Returns the deleted row or null. */
  async deleteRow(params: {
    formId: string;
    submissionId: string;
  }): Promise<typeof chefsSubmissionWebhook.$inferSelect | null> {
    const [row] = await this.db
      .delete(chefsSubmissionWebhook)
      .where(
        and(
          eq(chefsSubmissionWebhook.formId, params.formId),
          eq(chefsSubmissionWebhook.submissionId, params.submissionId),
        ),
      )
      .returning();
    return row ?? null;
  }

  /**
   * Inserts a new pending row, or — on conflict of the (form_id, submission_id) key —
   * refreshes execution_id and webhook_url so the latest Wait caller wins.
   */
  async upsertPending(params: {
    executionId: string;
    formId: string;
    submissionId: string;
    webhookUrl: string;
  }): Promise<typeof chefsSubmissionWebhook.$inferSelect> {
    const now = new Date();
    const [row] = await this.db
      .insert(chefsSubmissionWebhook)
      .values({
        executionId: params.executionId,
        formId: params.formId,
        submissionId: params.submissionId,
        webhookUrl: params.webhookUrl,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [chefsSubmissionWebhook.formId, chefsSubmissionWebhook.submissionId],
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
