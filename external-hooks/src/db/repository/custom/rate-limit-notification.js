"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitNotificationRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const rate_limit_notification_1 = require("../../schema/rate-limit-notification");
class RateLimitNotificationRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Claims the right to send one notification for (project, period, kind) by
     * inserting the claim row. Returns true when this call created the row —
     * the caller won the race and should send — and false when a claim already
     * exists (another run, possibly in another process, already sent it). The
     * unique constraint on (project_id, period_key, event_kind) makes the
     * insert atomic; concurrent claims cannot both win.
     */
    async claim(params) {
        const inserted = await this.db
            .insert(rate_limit_notification_1.rateLimitNotification)
            .values({
            projectId: params.projectId,
            periodKey: params.periodKey,
            eventKind: params.eventKind,
            usageCount: params.usageCount,
        })
            .onConflictDoNothing({
            target: [rate_limit_notification_1.rateLimitNotification.projectId, rate_limit_notification_1.rateLimitNotification.periodKey, rate_limit_notification_1.rateLimitNotification.eventKind],
        })
            .returning({ id: rate_limit_notification_1.rateLimitNotification.id });
        return inserted.length > 0;
    }
    /**
     * Deletes notification claims created before the cutoff and returns how
     * many rows were removed. Claims double as the sent-record, so pruning is
     * safe: a pruned period can never be current again.
     */
    async pruneOlderThan(cutoff) {
        const removed = await this.db
            .delete(rate_limit_notification_1.rateLimitNotification)
            .where((0, drizzle_orm_1.lt)(rate_limit_notification_1.rateLimitNotification.createdAt, cutoff))
            .returning({ id: rate_limit_notification_1.rateLimitNotification.id });
        return removed.length;
    }
}
exports.RateLimitNotificationRepository = RateLimitNotificationRepository;
