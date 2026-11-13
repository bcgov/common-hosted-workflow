'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const drizzle_orm_1 = require('drizzle-orm');
const project_topup_1 = require('../../../../src/db/repository/custom/project-topup');
const project_topup_2 = require('../../../../src/db/schema/project-topup');
(0, vitest_1.describe)('ProjectTopupRepository', () => {
  let db;
  let repo;
  (0, vitest_1.beforeEach)(() => {
    db = {
      select: vitest_1.vi.fn().mockReturnThis(),
      insert: vitest_1.vi.fn().mockReturnThis(),
      delete: vitest_1.vi.fn().mockReturnThis(),
      from: vitest_1.vi.fn().mockReturnThis(),
      where: vitest_1.vi.fn().mockReturnThis(),
      orderBy: vitest_1.vi.fn().mockReturnThis(),
      limit: vitest_1.vi.fn().mockReturnThis(),
      offset: vitest_1.vi.fn().mockResolvedValue([]),
      values: vitest_1.vi.fn().mockReturnThis(),
      returning: vitest_1.vi.fn().mockResolvedValue([]),
      groupBy: vitest_1.vi.fn().mockResolvedValue([]),
    };
    repo = new project_topup_1.ProjectTopupRepository(db);
  });
  (0, vitest_1.describe)('list', () => {
    (0, vitest_1.it)('should return one page of rows plus the project total', async () => {
      const rows = [{ id: 't-1', projectId: 'proj-123', periodKey: '2026-W45', amount: 2000 }];
      db.offset.mockResolvedValue(rows);
      // First where call continues the page chain; the second resolves the count query.
      db.where.mockReturnValueOnce(db).mockResolvedValueOnce([{ total: 7 }]);
      const result = await repo.list('proj-123', 3, 4);
      (0, vitest_1.expect)(db.select).toHaveBeenCalledTimes(2);
      (0, vitest_1.expect)(db.from).toHaveBeenNthCalledWith(1, project_topup_2.projectTopup);
      (0, vitest_1.expect)(db.from).toHaveBeenNthCalledWith(2, project_topup_2.projectTopup);
      (0, vitest_1.expect)(db.orderBy).toHaveBeenCalledWith(
        (0, drizzle_orm_1.desc)(project_topup_2.projectTopup.periodKey),
        (0, drizzle_orm_1.desc)(project_topup_2.projectTopup.createdAt),
      );
      (0, vitest_1.expect)(db.limit).toHaveBeenCalledWith(4);
      (0, vitest_1.expect)(db.offset).toHaveBeenCalledWith(8);
      (0, vitest_1.expect)(result).toEqual({ rows, totalItems: 7 });
    });
    (0, vitest_1.it)('should report 0 total items when the count query returns nothing', async () => {
      db.offset.mockResolvedValue([]);
      db.where.mockReturnValueOnce(db).mockResolvedValueOnce([]);
      const result = await repo.list('proj-123', 1, 4);
      (0, vitest_1.expect)(result).toEqual({ rows: [], totalItems: 0 });
    });
  });
  (0, vitest_1.describe)('getById', () => {
    (0, vitest_1.it)('should return the single matching row', async () => {
      const row = { id: 't-1', projectId: 'proj-123', periodKey: '2026-W45', amount: 2000 };
      db.limit.mockResolvedValue([row]);
      const result = await repo.getById('proj-123', 't-1');
      (0, vitest_1.expect)(db.where).toHaveBeenCalledTimes(1);
      (0, vitest_1.expect)(result).toEqual(row);
    });
    (0, vitest_1.it)('should return null when no row matches', async () => {
      db.limit.mockResolvedValue([]);
      const result = await repo.getById('proj-123', 'missing');
      (0, vitest_1.expect)(result).toBeNull();
    });
  });
  (0, vitest_1.describe)('create', () => {
    (0, vitest_1.it)('should insert the params and return the stored row', async () => {
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
      (0, vitest_1.expect)(db.insert).toHaveBeenCalledWith(project_topup_2.projectTopup);
      (0, vitest_1.expect)(db.values).toHaveBeenCalledWith({
        projectId: 'proj-123',
        periodKey: '2026-W45',
        amount: 100,
        adminComment: 'why',
        createdBy: 'admin@example.com',
      });
      (0, vitest_1.expect)(result).toEqual(stored);
    });
  });
  (0, vitest_1.describe)('deleteById', () => {
    (0, vitest_1.it)('should return true when a row was deleted', async () => {
      db.returning.mockResolvedValue([{ id: 't-1' }]);
      const result = await repo.deleteById('t-1');
      (0, vitest_1.expect)(db.delete).toHaveBeenCalledWith(project_topup_2.projectTopup);
      (0, vitest_1.expect)(db.returning).toHaveBeenCalledWith({ id: project_topup_2.projectTopup.id });
      (0, vitest_1.expect)(result).toBe(true);
    });
    (0, vitest_1.it)('should return false when nothing was deleted', async () => {
      db.returning.mockResolvedValue([]);
      const result = await repo.deleteById('missing');
      (0, vitest_1.expect)(result).toBe(false);
    });
  });
  (0, vitest_1.describe)('sumByProjectIds', () => {
    (0, vitest_1.it)('should return an empty Map without querying for empty input', async () => {
      const result = await repo.sumByProjectIds([], '2026-W44');
      (0, vitest_1.expect)(result).toBeInstanceOf(Map);
      (0, vitest_1.expect)(result.size).toBe(0);
      (0, vitest_1.expect)(db.select).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('should aggregate per-project sums for one period key', async () => {
      db.groupBy.mockResolvedValue([
        { projectId: 'proj-1', total: 2500 },
        { projectId: 'proj-2', total: 100 },
      ]);
      const result = await repo.sumByProjectIds(['proj-1', 'proj-2', 'proj-3'], '2026-W44');
      (0, vitest_1.expect)(db.groupBy).toHaveBeenCalledWith(project_topup_2.projectTopup.projectId);
      (0, vitest_1.expect)(result.get('proj-1')).toBe(2500);
      (0, vitest_1.expect)(result.get('proj-2')).toBe(100);
      (0, vitest_1.expect)(result.get('proj-3')).toBeUndefined();
    });
  });
  (0, vitest_1.describe)('sumByProjectIdsInWeeklyKeys', () => {
    (0, vitest_1.it)('should return an empty Map without querying for empty project or key input', async () => {
      (0, vitest_1.expect)(await repo.sumByProjectIdsInWeeklyKeys([], ['2026-W44'])).toEqual(new Map());
      (0, vitest_1.expect)(await repo.sumByProjectIdsInWeeklyKeys(['proj-1'], [])).toEqual(new Map());
      (0, vitest_1.expect)(db.select).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('should aggregate per-project sums across the given weekly keys', async () => {
      db.groupBy.mockResolvedValue([{ projectId: 'proj-1', total: 1000 }]);
      const result = await repo.sumByProjectIdsInWeeklyKeys(['proj-1', 'proj-2'], ['2026-W44', '2026-W45']);
      (0, vitest_1.expect)(db.groupBy).toHaveBeenCalledWith(project_topup_2.projectTopup.projectId);
      (0, vitest_1.expect)(result.get('proj-1')).toBe(1000);
      (0, vitest_1.expect)(result.get('proj-2')).toBeUndefined();
    });
  });
});
