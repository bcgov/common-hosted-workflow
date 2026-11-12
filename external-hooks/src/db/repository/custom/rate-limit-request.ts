import { and, desc, eq } from 'drizzle-orm';
import { rateLimitRequest } from '../../schema/rate-limit-request';
import type { NewRateLimitRequest, RateLimitRequest } from '../../schema/rate-limit-request';

export class RateLimitRequestRepository {
  constructor(private readonly db: any) {}

  /**
   * Returns the project's pending request, or null when none is open. Used by
   * the project detail endpoint (review panel) and as the pre-insert check;
   * the partial unique index is the actual race-safe guard.
   */
  async getPendingByProjectId(projectId: string): Promise<RateLimitRequest | null> {
    const rows: RateLimitRequest[] = await this.db
      .select()
      .from(rateLimitRequest)
      .where(and(eq(rateLimitRequest.projectId, projectId), eq(rateLimitRequest.status, 'pending')))
      .orderBy(desc(rateLimitRequest.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Inserts a pending request. Returns the created row; a unique violation
   * (code 23505 on the pending-per-project index) is left to the caller to
   * translate into a 409 — a concurrent submit raced this one.
   */
  async create(values: NewRateLimitRequest): Promise<RateLimitRequest> {
    const rows: RateLimitRequest[] = await this.db.insert(rateLimitRequest).values(values).returning();
    return rows[0];
  }

  /**
   * Cancels the requester's own pending request. Returns the updated row, or
   * null when no pending request matches (unknown id, already decided, or not
   * the requester's own submission — the caller cannot distinguish these).
   */
  async cancelPending(requestId: string, projectId: string, requestedBy: string): Promise<RateLimitRequest | null> {
    const rows: RateLimitRequest[] = await this.db
      .update(rateLimitRequest)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(rateLimitRequest.id, requestId),
          eq(rateLimitRequest.projectId, projectId),
          eq(rateLimitRequest.requestedBy, requestedBy),
          eq(rateLimitRequest.status, 'pending'),
        ),
      )
      .returning();
    return rows[0] ?? null;
  }
}
