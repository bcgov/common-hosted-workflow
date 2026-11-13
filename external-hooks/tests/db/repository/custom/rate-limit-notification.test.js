'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const drizzle_orm_1 = require('drizzle-orm');
const rate_limit_notification_1 = require('../../../../src/db/repository/custom/rate-limit-notification');
const rate_limit_notification_2 = require('../../../../src/db/schema/rate-limit-notification');
(0, vitest_1.describe)('RateLimitNotificationRepository', () => {
  let db;
  let repo;
  (0, vitest_1.beforeEach)(() => {
    db = {
      insert: vitest_1.vi.fn().mockReturnThis(),
      values: vitest_1.vi.fn().mockReturnThis(),
      onConflictDoNothing: vitest_1.vi.fn().mockReturnThis(),
      returning: vitest_1.vi.fn().mockResolvedValue([]),
      delete: vitest_1.vi.fn().mockReturnThis(),
      where: vitest_1.vi.fn().mockReturnThis(),
    };
    repo = new rate_limit_notification_1.RateLimitNotificationRepository(db);
  });
  (0, vitest_1.describe)('claim', () => {
    (0, vitest_1.it)(
      'should insert the claim with an on-conflict guard and return true when the row was created',
      async () => {
        db.returning.mockResolvedValue([{ id: 'n-1' }]);
        const won = await repo.claim({
          projectId: 'proj-123',
          periodKey: '2026-W45',
          eventKind: 'weekly_reached_hard',
          usageCount: 5000,
        });
        (0, vitest_1.expect)(db.insert).toHaveBeenCalledWith(rate_limit_notification_2.rateLimitNotification);
        (0, vitest_1.expect)(db.values).toHaveBeenCalledWith({
          projectId: 'proj-123',
          periodKey: '2026-W45',
          eventKind: 'weekly_reached_hard',
          usageCount: 5000,
        });
        (0, vitest_1.expect)(db.onConflictDoNothing).toHaveBeenCalledWith({
          target: [
            rate_limit_notification_2.rateLimitNotification.projectId,
            rate_limit_notification_2.rateLimitNotification.periodKey,
            rate_limit_notification_2.rateLimitNotification.eventKind,
          ],
        });
        (0, vitest_1.expect)(won).toBe(true);
      },
    );
    (0, vitest_1.it)('should return false when a claim already exists (nothing returned)', async () => {
      db.returning.mockResolvedValue([]);
      const won = await repo.claim({
        projectId: 'proj-123',
        periodKey: '2026-W45',
        eventKind: 'weekly_reached_hard',
        usageCount: 5000,
      });
      (0, vitest_1.expect)(won).toBe(false);
    });
  });
  (0, vitest_1.describe)('pruneOlderThan', () => {
    (0, vitest_1.it)('should delete rows created before the cutoff and return the removed count', async () => {
      const cutoff = new Date('2026-01-01T00:00:00Z');
      db.returning.mockResolvedValue([{ id: 'n-1' }, { id: 'n-2' }]);
      const removed = await repo.pruneOlderThan(cutoff);
      (0, vitest_1.expect)(db.delete).toHaveBeenCalledWith(rate_limit_notification_2.rateLimitNotification);
      (0, vitest_1.expect)(db.where).toHaveBeenCalledWith(
        (0, drizzle_orm_1.lt)(rate_limit_notification_2.rateLimitNotification.createdAt, cutoff),
      );
      (0, vitest_1.expect)(removed).toBe(2);
    });
    (0, vitest_1.it)('should return 0 when nothing was removed', async () => {
      db.returning.mockResolvedValue([]);
      const removed = await repo.pruneOlderThan(new Date('2026-01-01T00:00:00Z'));
      (0, vitest_1.expect)(removed).toBe(0);
    });
  });
});
