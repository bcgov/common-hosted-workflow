import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { ProjectExecutionUsageRepository } from '../../../../src/db/repository/custom/project-execution-usage';
import { projectExecutionUsage } from '../../../../src/db/schema/project-execution-usage';

describe('ProjectExecutionUsageRepository', () => {
  let db: any;
  let repo: ProjectExecutionUsageRepository;

  beforeEach(() => {
    db = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    repo = new ProjectExecutionUsageRepository(db);
  });

  describe('getCounts', () => {
    it('should return weekly and yearly counts from a single query', async () => {
      db.where.mockResolvedValue([
        { periodType: 'weekly', count: 7 },
        { periodType: 'yearly', count: 42 },
      ]);

      const result = await repo.getCounts('proj-123', '2026-W44', '2026');

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db.where).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ weeklyCount: 7, yearlyCount: 42 });
    });

    it('should report 0 for a missing weekly row', async () => {
      db.where.mockResolvedValue([{ periodType: 'yearly', count: 42 }]);

      const result = await repo.getCounts('proj-123', '2026-W44', '2026');

      expect(result).toEqual({ weeklyCount: 0, yearlyCount: 42 });
    });

    it('should report 0 for a missing yearly row', async () => {
      db.where.mockResolvedValue([{ periodType: 'weekly', count: 7 }]);

      const result = await repo.getCounts('proj-123', '2026-W44', '2026');

      expect(result).toEqual({ weeklyCount: 7, yearlyCount: 0 });
    });

    it('should report 0 for both periods when no rows exist', async () => {
      db.where.mockResolvedValue([]);

      const result = await repo.getCounts('proj-123', '2026-W44', '2026');

      expect(result).toEqual({ weeklyCount: 0, yearlyCount: 0 });
    });
  });

  describe('increment', () => {
    it('should atomically upsert-increment with count + 1 and refresh updated_at', async () => {
      await repo.increment('proj-123', 'weekly', '2026-W44');

      expect(db.insert).toHaveBeenCalledWith(projectExecutionUsage);
      expect(db.values).toHaveBeenCalledWith({
        projectId: 'proj-123',
        periodType: 'weekly',
        periodKey: '2026-W44',
        count: 1,
      });
      expect(db.onConflictDoUpdate).toHaveBeenCalledWith({
        target: [projectExecutionUsage.projectId, projectExecutionUsage.periodType, projectExecutionUsage.periodKey],
        set: {
          count: sql`${projectExecutionUsage.count} + 1`,
          updatedAt: sql`now()`,
        },
      });
    });
  });

  describe('listCountsByProjectIds', () => {
    it('should return an empty Map without querying for empty input', async () => {
      const result = await repo.listCountsByProjectIds([], '2026-W44', '2026');

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('should aggregate rows into per-project weekly and yearly counts', async () => {
      db.where.mockResolvedValue([
        { projectId: 'proj-1', periodType: 'weekly', count: 5 },
        { projectId: 'proj-1', periodType: 'yearly', count: 50 },
        { projectId: 'proj-2', periodType: 'weekly', count: 2 },
      ]);

      const result = await repo.listCountsByProjectIds(['proj-1', 'proj-2'], '2026-W44', '2026');

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db.where).toHaveBeenCalledTimes(1);
      expect(result.get('proj-1')).toEqual({ weeklyCount: 5, yearlyCount: 50 });
      expect(result.get('proj-2')).toEqual({ weeklyCount: 2, yearlyCount: 0 });
    });

    it('should default to zero counts for projects without usage rows', async () => {
      db.where.mockResolvedValue([{ projectId: 'proj-2', periodType: 'yearly', count: 3 }]);

      const result = await repo.listCountsByProjectIds(['proj-1', 'proj-2'], '2026-W44', '2026');

      expect(result.get('proj-1')).toEqual({ weeklyCount: 0, yearlyCount: 0 });
      expect(result.get('proj-2')).toEqual({ weeklyCount: 0, yearlyCount: 3 });
    });
  });
});
