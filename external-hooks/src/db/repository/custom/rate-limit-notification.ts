import { lt } from 'drizzle-orm';
import { rateLimitNotification } from '../../schema/rate-limit-notification';

export type RateLimitNotificationClaim = {
  projectId: string;
  periodKey: string;
  eventKind: string;
  usageCount: number;
};

export class RateLimitNotificationRepository {
  constructor(private readonly db: any) {}

  /**
   * Claims the right to send one notification for (project, period, kind) by
   * inserting the claim row. Returns true when this call created the row —
   * the caller won the race and should send — and false when a claim already
   * exists (another run, possibly in another process, already sent it). The
   * unique constraint on (project_id, period_key, event_kind) makes the
   * insert atomic; concurrent claims cannot both win.
   */
  async claim(params: RateLimitNotificationClaim): Promise<boolean> {
    const inserted = await this.db
      .insert(rateLimitNotification)
      .values({
        projectId: params.projectId,
        periodKey: params.periodKey,
        eventKind: params.eventKind,
        usageCount: params.usageCount,
      })
      .onConflictDoNothing({
        target: [rateLimitNotification.projectId, rateLimitNotification.periodKey, rateLimitNotification.eventKind],
      })
      .returning({ id: rateLimitNotification.id });
    return inserted.length > 0;
  }

  /**
   * Deletes notification claims created before the cutoff and returns how
   * many rows were removed. Claims double as the sent-record, so pruning is
   * safe: a pruned period can never be current again.
   */
  async pruneOlderThan(cutoff: Date): Promise<number> {
    const removed = await this.db
      .delete(rateLimitNotification)
      .where(lt(rateLimitNotification.createdAt, cutoff))
      .returning({ id: rateLimitNotification.id });
    return removed.length;
  }
}
