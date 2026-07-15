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
          eq(chefsSubmissionWebhook.status, 'pending'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Marks the pending row for a form/submission pair as completed. Returns the updated row or null. */
  async markCompleted(params: {
    formId: string;
    submissionId: string;
  }): Promise<typeof chefsSubmissionWebhook.$inferSelect | null> {
    const [row] = await this.db
      .update(chefsSubmissionWebhook)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(
        and(
          eq(chefsSubmissionWebhook.formId, params.formId),
          eq(chefsSubmissionWebhook.submissionId, params.submissionId),
          eq(chefsSubmissionWebhook.status, 'pending'),
        ),
      )
      .returning();
    return row ?? null;
  }
}
