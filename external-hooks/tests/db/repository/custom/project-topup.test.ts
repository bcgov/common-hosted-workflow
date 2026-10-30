import { describe, it, expect, vi, beforeEach } from 'vitest';
import { desc } from 'drizzle-orm';
import { ProjectTopupRepository } from '../../../../src/db/repository/custom/project-topup';
import { projectTopup } from '../../../../src/db/schema/project-topup';

describe('ProjectTopupRepository', () => {
  let db: any;
  let repo: ProjectTopupRepository;

  beforeEach(() => {
    db = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    };
    repo = new ProjectTopupRepository(db);
  });

  describe('list', () => {
    it('should return one page of rows plus the project total', async () => {
      const rows = [{ id: 't-1', projectId: 'proj-123', periodKey: '2026-W45', amount: 2000 }];
      db.offset.mockResolvedValue(rows);
      // First where call continues the page chain; the second resolves the count query.
      db.where.mockReturnValueOnce(db).mockResolvedValueOnce([{ total: 7 }]);

      const result = await repo.list('proj-123', 3, 4);

      expect(db.select).toHaveBeenCalledTimes(2);
      expect(db.from).toHaveBeenNthCalledWith(1, projectTopup);
      expect(db.from).toHaveBeenNthCalledWith(2, projectTopup);
      expect(db.orderBy).toHaveBeenCalledWith(desc(projectTopup.periodKey), desc(projectTopup.createdAt));
      expect(db.limit).toHaveBeenCalledWith(4);
      expect(db.offset).toHaveBeenCalledWith(8);
      expect(result).toEqual({ rows, totalItems: 7 });
    });

    it('should report 0 total items when the count query returns nothing', async () => {
      db.offset.mockResolvedValue([]);
      db.where.mockReturnValueOnce(db).mockResolvedValueOnce([]);

      const result = await repo.list('proj-123', 1, 4);

      expect(result).toEqual({ rows: [], totalItems: 0 });
    });
  });

  describe('getById', () => {
    it('should return the single matching row', async () => {
      const row = { id: 't-1', projectId: 'proj-123', periodKey: '2026-W45', amount: 2000 };
      db.limit.mockResolvedValue([row]);

      const result = await repo.getById('proj-123', 't-1');

      expect(db.where).toHaveBeenCalledTimes(1);
      expect(result).toEqual(row);
    });

    it('should return null when no row matches', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.getById('proj-123', 'missing');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should insert the params and return the stored row', async () => {
      const stored = {
        id: 't-1',
        projectId: 'proj-123',
        periodKey: '2026-W45',
        amount: 100,
        adminComment: 'why',
        createdBy: 'admin@example.com',
        createdAt: new Date('2025-06-01T12:00:00.000Z'),
      };
      db.returning.mockResolvedValue([stored]);

      const result = await repo.create({
        projectId: 'proj-123',
        periodKey: '2026-W45',
        amount: 100,
        adminComment: 'why',
        createdBy: 'admin@example.com',
      });

      expect(db.insert).toHaveBeenCalledWith(projectTopup);
      expect(db.values).toHaveBeenCalledWith({
        projectId: 'proj-123',
        periodKey: '2026-W45',
        amount: 100,
        adminComment: 'why',
        createdBy: 'admin@example.com',
      });
      expect(result).toEqual(stored);
    });
  });

  describe('deleteById', () => {
    it('should return true when a row was deleted', async () => {
      db.returning.mockResolvedValue([{ id: 't-1' }]);

      const result = await repo.deleteById('t-1');

      expect(db.delete).toHaveBeenCalledWith(projectTopup);
      expect(db.returning).toHaveBeenCalledWith({ id: projectTopup.id });
      expect(result).toBe(true);
    });

    it('should return false when nothing was deleted', async () => {
      db.returning.mockResolvedValue([]);

      const result = await repo.deleteById('missing');

      expect(result).toBe(false);
    });
  });

  describe('sumByProjectIds', () => {
    it('should return an empty Map without querying for empty input', async () => {
      const result = await repo.sumByProjectIds([], '2026-W44');

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('should aggregate per-project sums for one period key', async () => {
      db.groupBy.mockResolvedValue([
        { projectId: 'proj-1', total: 2500 },
        { projectId: 'proj-2', total: 100 },
      ]);

      const result = await repo.sumByProjectIds(['proj-1', 'proj-2', 'proj-3'], '2026-W44');

      expect(db.groupBy).toHaveBeenCalledWith(projectTopup.projectId);
      expect(result.get('proj-1')).toBe(2500);
      expect(result.get('proj-2')).toBe(100);
      expect(result.get('proj-3')).toBeUndefined();
    });
  });
});
