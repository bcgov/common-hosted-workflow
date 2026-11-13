"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitRequestRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const project_topup_1 = require("../../schema/project-topup");
const project_rate_limit_1 = require("../../schema/project-rate-limit");
const rate_limit_request_1 = require("../../schema/rate-limit-request");
class RateLimitRequestRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Returns the project's pending request, or null when none is open. Used by
     * the project detail endpoint (review panel) and as the pre-insert check;
     * the partial unique index is the actual race-safe guard.
     */
    async getPendingByProjectId(projectId) {
        const rows = await this.db
            .select()
            .from(rate_limit_request_1.rateLimitRequest)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(rate_limit_request_1.rateLimitRequest.projectId, projectId), (0, drizzle_orm_1.eq)(rate_limit_request_1.rateLimitRequest.status, 'pending')))
            .orderBy((0, drizzle_orm_1.desc)(rate_limit_request_1.rateLimitRequest.createdAt))
            .limit(1);
        return rows[0] ?? null;
    }
    /**
     * Inserts a pending request. Returns the created row; a unique violation
     * (code 23505 on the pending-per-project index) is left to the caller to
     * translate into a 409 — a concurrent submit raced this one.
     */
    async create(values) {
        const rows = await this.db.insert(rate_limit_request_1.rateLimitRequest).values(values).returning();
        return rows[0];
    }
    /**
     * Cancels the requester's own pending request. Returns the updated row, or
     * null when no pending request matches (unknown id, already decided, or not
     * the requester's own submission — the caller cannot distinguish these).
     */
    async cancelPending(requestId, projectId, requestedBy) {
        const rows = await this.db
            .update(rate_limit_request_1.rateLimitRequest)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(rate_limit_request_1.rateLimitRequest.id, requestId), (0, drizzle_orm_1.eq)(rate_limit_request_1.rateLimitRequest.projectId, projectId), (0, drizzle_orm_1.eq)(rate_limit_request_1.rateLimitRequest.requestedBy, requestedBy), (0, drizzle_orm_1.eq)(rate_limit_request_1.rateLimitRequest.status, 'pending')))
            .returning();
        return rows[0] ?? null;
    }
    /** Returns a request row by id, or null when it does not exist. */
    async getById(requestId) {
        const rows = await this.db
            .select()
            .from(rate_limit_request_1.rateLimitRequest)
            .where((0, drizzle_orm_1.eq)(rate_limit_request_1.rateLimitRequest.id, requestId))
            .limit(1);
        return rows[0] ?? null;
    }
    /** All request rows for the given statuses, oldest first. Request volume is small, so the admin list enriches, filters and paginates in the service. */
    async listByStatuses(statuses) {
        if (statuses.length === 0) {
            return [];
        }
        return this.db
            .select()
            .from(rate_limit_request_1.rateLimitRequest)
            .where((0, drizzle_orm_1.inArray)(rate_limit_request_1.rateLimitRequest.status, statuses))
            .orderBy(rate_limit_request_1.rateLimitRequest.createdAt, rate_limit_request_1.rateLimitRequest.id);
    }
    /**
     * Decides a pending request inside one transaction: the status transition is
     * conditioned on `status = 'pending'`, so a concurrent cancel (or second
     * decision) makes it a no-op and null is returned; the `fulfill` callback
     * (top-up insert / limit upsert) runs in the same transaction, so fulfillment
     * and the decision record can never land without each other.
     */
    async decidePending(requestId, patch, fulfill) {
        return this.db.transaction(async (tx) => {
            const rows = await tx
                .update(rate_limit_request_1.rateLimitRequest)
                .set({ ...patch, decidedAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(rate_limit_request_1.rateLimitRequest.id, requestId), (0, drizzle_orm_1.eq)(rate_limit_request_1.rateLimitRequest.status, 'pending')))
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
    async approveAsTopup(requestId, decision, topup) {
        return this.decidePending(requestId, { status: 'approved', ...decision, decidedWeeklyLimit: null, decidedAnnualLimit: null }, (tx) => tx.insert(project_topup_1.projectTopup).values({
            projectId: topup.projectId,
            periodKey: topup.periodKey,
            amount: decision.grantedRuns,
            adminComment: topup.adminComment,
            createdBy: decision.decidedBy,
        }));
    }
    /**
     * Approves a limit-raise request and applies the new limits atomically
     * (same transaction, full-replace semantics like Edit limits: the project
     * leaves defaults mode with the granted values; unasked periods stay null
     * and fall back to scope defaults at enforcement time). Returns the approved
     * row, or null when the request was no longer pending.
     */
    async approveAsLimitChange(requestId, decision, limits) {
        return this.decidePending(requestId, { status: 'approved', grantedRuns: null, ...decision }, (tx) => tx
            .insert(project_rate_limit_1.projectRateLimit)
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
            target: project_rate_limit_1.projectRateLimit.projectId,
            set: {
                usesDefaultLimits: false,
                weeklyRateLimit: decision.decidedWeeklyLimit,
                yearlyRateLimit: decision.decidedAnnualLimit,
                lastAdminComment: limits.lastAdminComment,
                stopBehavior: 'hard_stop',
                updatedBy: decision.decidedBy,
                updatedAt: new Date(),
            },
        }));
    }
    /**
     * Denies a pending request (no fulfillment). Returns the rejected row, or
     * null when the request was no longer pending.
     */
    async rejectPending(requestId, decision) {
        return this.decidePending(requestId, {
            status: 'rejected',
            grantedRuns: null,
            decidedWeeklyLimit: null,
            decidedAnnualLimit: null,
            ...decision,
        });
    }
}
exports.RateLimitRequestRepository = RateLimitRequestRepository;
