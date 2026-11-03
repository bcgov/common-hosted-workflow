import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lt } from 'drizzle-orm';
import { RateLimitNotificationRepository } from '../../../../src/db/repository/custom/rate-limit-notification';
import { rateLimitNotification } from '../../../../src/db/schema/rate-limit-notification';

describe('RateLimitNotificationRepository', () => {
  let db: any;
  let repo: RateLimitNotificationRepository;

  beforeEach(() => {
    db = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    };
    repo = new RateLimitNotificationRepository(db);
  });

  describe('claim', () => {
    it('should insert the claim with an on-conflict guard and return true when the row was created', async () => {
      db.returning.mockResolvedValue([{ id: 'n-1' }]);

      const won = await repo.claim({
        projectId: 'proj-123',
        periodKey: '2026-W45',
        eventKind: 'weekly_reached_hard',
        usageCount: 5000,
      });

      expect(db.insert).toHaveBeenCalledWith(rateLimitNotification);
      expect(db.values).toHaveBeenCalledWith({
        projectId: 'proj-123',
        periodKey: '2026-W45',
        eventKind: 'weekly_reached_hard',
        usageCount: 5000,
      });
      expect(db.onConflictDoNothing).toHaveBeenCalledWith({
        target: [rateLimitNotification.projectId, rateLimitNotification.periodKey, rateLimitNotification.eventKind],
      });
      expect(won).toBe(true);
    });

    it('should return false when a claim already exists (nothing returned)', async () => {
      db.returning.mockResolvedValue([]);

      const won = await repo.claim({
        projectId: 'proj-123',
        periodKey: '2026-W45',
        eventKind: 'weekly_reached_hard',
        usageCount: 5000,
      });

      expect(won).toBe(false);
    });
  });

  describe('pruneOlderThan', () => {
    it('should delete rows created before the cutoff and return the removed count', async () => {
      const cutoff = new Date('2026-01-01T00:00:00Z');
      db.returning.mockResolvedValue([{ id: 'n-1' }, { id: 'n-2' }]);

      const removed = await repo.pruneOlderThan(cutoff);

      expect(db.delete).toHaveBeenCalledWith(rateLimitNotification);
      expect(db.where).toHaveBeenCalledWith(lt(rateLimitNotification.createdAt, cutoff));
      expect(removed).toBe(2);
    });

    it('should return 0 when nothing was removed', async () => {
      db.returning.mockResolvedValue([]);

      const removed = await repo.pruneOlderThan(new Date('2026-01-01T00:00:00Z'));

      expect(removed).toBe(0);
    });
  });
});
