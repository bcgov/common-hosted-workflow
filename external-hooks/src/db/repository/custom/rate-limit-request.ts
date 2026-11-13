import { and, desc, eq, inArray } from 'drizzle-orm';
import { projectTopup } from '../../schema/project-topup';
import { projectRateLimit } from '../../schema/project-rate-limit';
import { rateLimitRequest } from '../../schema/rate-limit-request';
import type { NewRateLimitRequest, RateLimitRequest, RunRequestStatus } from '../../schema/rate-limit-request';

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

  /** Returns a request row by id, or null when it does not exist. */
  async getById(requestId: string): Promise<RateLimitRequest | null> {
    const rows: RateLimitRequest[] = await this.db
      .select()
      .from(rateLimitRequest)
      .where(eq(rateLimitRequest.id, requestId))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * All request rows for the given statuses (optionally scoped to project IDs),
   * oldest first. Request volume is small, so the list consumers enrich,
   * filter and paginate in the service. `projectIds` scopes the rows to the
   * caller's accessible projects (member view); an empty array short-circuits
   * to no rows, `undefined` means unscoped (admin view).
   */
  async listByStatuses(statuses: RunRequestStatus[], projectIds?: string[]): Promise<RateLimitRequest[]> {
    if (statuses.length === 0 || (projectIds !== undefined && projectIds.length === 0)) {
      return [];
    }
    const conditions = [inArray(rateLimitRequest.status, statuses)];
    if (projectIds !== undefined) {
      conditions.push(inArray(rateLimitRequest.projectId, projectIds));
    }
    return this.db
      .select()
      .from(rateLimitRequest)
      .where(and(...conditions))
      .orderBy(rateLimitRequest.createdAt, rateLimitRequest.id);
  }

  /**
   * Decides a pending request inside one transaction: the status transition is
   * conditioned on `status = 'pending'`, so a concurrent cancel (or second
   * decision) makes it a no-op and null is returned; the `fulfill` callback
   * (top-up insert / limit upsert) runs in the same transaction, so fulfillment
   * and the decision record can never land without each other.
   */
  private async decidePending(
    requestId: string,
    patch: {
      status: 'approved' | 'rejected';
      grantedRuns: number | null;
      decidedWeeklyLimit: number | null;
      decidedAnnualLimit: number | null;
      decisionNote: string | null;
      decidedBy: string | null;
    },
    fulfill?: (tx: any) => Promise<void>,
  ): Promise<RateLimitRequest | null> {
    return this.db.transaction(async (tx: any) => {
      const rows: RateLimitRequest[] = await tx
        .update(rateLimitRequest)
        .set({ ...patch, decidedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(rateLimitRequest.id, requestId), eq(rateLimitRequest.status, 'pending')))
        .returning();
      if (rows.length === 0) {
        return null;
      }
      if (fulfill) {
        await fulfill(tx);
      }
      return rows[0];
    });
  }

  /**
   * Approves an extra-runs request and inserts the fulfilling top-up atomically
   * (same transaction). Returns the approved row, or null when the request was
   * no longer pending (cancelled or already decided).
   */
  async approveAsTopup(
    requestId: string,
    decision: {
      grantedRuns: number;
      decisionNote: string | null;
      decidedBy: string | null;
    },
    topup: { projectId: string; periodKey: string; adminComment: string },
  ): Promise<RateLimitRequest | null> {
    return this.decidePending(
      requestId,
      { status: 'approved', ...decision, decidedWeeklyLimit: null, decidedAnnualLimit: null },
      (tx) =>
        tx.insert(projectTopup).values({
          projectId: topup.projectId,
          periodKey: topup.periodKey,
          amount: decision.grantedRuns,
          adminComment: topup.adminComment,
          createdBy: decision.decidedBy,
        }),
    );
  }

  /**
   * Approves a limit-raise request and applies the new limits atomically
   * (same transaction, full-replace semantics like Edit limits: the project
   * leaves defaults mode with the granted values; unasked periods stay null
   * and fall back to scope defaults at enforcement time). Returns the approved
   * row, or null when the request was no longer pending.
   */
  async approveAsLimitChange(
    requestId: string,
    decision: {
      decidedWeeklyLimit: number | null;
      decidedAnnualLimit: number | null;
      decisionNote: string | null;
      decidedBy: string | null;
    },
    limits: { projectId: string; lastAdminComment: string | null },
  ): Promise<RateLimitRequest | null> {
    return this.decidePending(requestId, { status: 'approved', grantedRuns: null, ...decision }, (tx) =>
      tx
        .insert(projectRateLimit)
        .values({
          projectId: limits.projectId,
          usesDefaultLimits: false,
          weeklyRateLimit: decision.decidedWeeklyLimit,
          yearlyRateLimit: decision.decidedAnnualLimit,
          lastAdminComment: limits.lastAdminComment,
          stopBehavior: 'hard_stop',
          updatedBy: decision.decidedBy,
        })
        .onConflictDoUpdate({
          target: projectRateLimit.projectId,
          set: {
            usesDefaultLimits: false,
            weeklyRateLimit: decision.decidedWeeklyLimit,
            yearlyRateLimit: decision.decidedAnnualLimit,
            lastAdminComment: limits.lastAdminComment,
            stopBehavior: 'hard_stop',
            updatedBy: decision.decidedBy,
            updatedAt: new Date(),
          },
        }),
    );
  }

  /**
   * Denies a pending request (no fulfillment). Returns the rejected row, or
   * null when the request was no longer pending.
   */
  async rejectPending(
    requestId: string,
    decision: { decisionNote: string; decidedBy: string | null },
  ): Promise<RateLimitRequest | null> {
    return this.decidePending(requestId, {
      status: 'rejected',
      grantedRuns: null,
      decidedWeeklyLimit: null,
      decidedAnnualLimit: null,
      ...decision,
    });
  }
}
