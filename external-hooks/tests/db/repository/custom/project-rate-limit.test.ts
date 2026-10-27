import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inArray, sql } from 'drizzle-orm';
import { ProjectRateLimitRepository } from '../../../../src/db/repository/custom/project-rate-limit';
import { projectRateLimit } from '../../../../src/db/schema/project-rate-limit';

describe('ProjectRateLimitRepository', () => {
  let db: any;
  let repo: ProjectRateLimitRepository;

  beforeEach(() => {
    db = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    repo = new ProjectRateLimitRepository(db);
  });

  describe('get', () => {
    it('should return the configuration row when found', async () => {
      const mockRow = {
        projectId: 'proj-123',
        weeklyRateLimit: 100,
        yearlyRateLimit: 5000,
        lastAdminComment: 'Cap for FY',
        stopBehavior: 'hard_stop',
      };
      db.limit.mockResolvedValue([mockRow]);

      const result = await repo.get('proj-123');

      expect(db.select).toHaveBeenCalled();
      expect(db.where).toHaveBeenCalled();
      expect(result).toEqual(mockRow);
    });

    it('should return null when the project has no configuration', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.get('nonexistent-project');

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('should insert the given values and upsert on the projectId primary key', async () => {
      const params = {
        projectId: 'proj-123',
        weeklyRateLimit: 100,
        yearlyRateLimit: 5000,
        lastAdminComment: 'Cap for FY',
        stopBehavior: 'hard_stop',
      };

      await repo.upsert(params);

      expect(db.insert).toHaveBeenCalledWith(projectRateLimit);
      expect(db.values).toHaveBeenCalledWith(params);
      expect(db.onConflictDoUpdate).toHaveBeenCalledWith({
        target: projectRateLimit.projectId,
        set: {
          weeklyRateLimit: params.weeklyRateLimit,
          yearlyRateLimit: params.yearlyRateLimit,
          lastAdminComment: params.lastAdminComment,
          stopBehavior: params.stopBehavior,
          updatedAt: sql`now()`,
        },
      });
    });

    it('should pass explicit nulls through to clear limits and comment', async () => {
      const params = {
        projectId: 'proj-123',
        weeklyRateLimit: null,
        yearlyRateLimit: null,
        lastAdminComment: null,
        stopBehavior: 'soft_stop',
      };

      await repo.upsert(params);

      expect(db.values).toHaveBeenCalledWith(params);
      expect(db.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: {
            weeklyRateLimit: null,
            yearlyRateLimit: null,
            lastAdminComment: null,
            stopBehavior: 'soft_stop',
            updatedAt: sql`now()`,
          },
        }),
      );
    });
  });

  describe('listByProjectIds', () => {
    it('should return an empty Map without querying for empty input', async () => {
      const result = await repo.listByProjectIds([]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('should return a Map of projectId to configuration rows', async () => {
      const rowOne = {
        projectId: 'proj-1',
        weeklyRateLimit: 100,
        yearlyRateLimit: 5000,
        lastAdminComment: null,
        stopBehavior: 'hard_stop',
      };
      const rowTwo = {
        projectId: 'proj-2',
        weeklyRateLimit: null,
        yearlyRateLimit: null,
        lastAdminComment: 'Unlimited for now',
        stopBehavior: 'soft_stop',
      };
      db.where.mockResolvedValue([rowOne, rowTwo]);

      const result = await repo.listByProjectIds(['proj-1', 'proj-2']);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('proj-1')).toEqual(rowOne);
      expect(result.get('proj-2')).toEqual(rowTwo);
    });

    it('should filter by projectId using inArray', async () => {
      db.where.mockResolvedValue([]);

      await repo.listByProjectIds(['proj-1', 'proj-2']);

      expect(db.where).toHaveBeenCalledWith(inArray(projectRateLimit.projectId, ['proj-1', 'proj-2']));
    });

    it('should return an empty Map when no rows match', async () => {
      db.where.mockResolvedValue([]);

      const result = await repo.listByProjectIds(['unknown-project']);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });
});
