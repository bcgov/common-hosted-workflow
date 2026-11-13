"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const drizzle_orm_1 = require("drizzle-orm");
const project_execution_usage_1 = require("../../../../src/db/repository/custom/project-execution-usage");
const project_execution_usage_2 = require("../../../../src/db/schema/project-execution-usage");
(0, vitest_1.describe)('ProjectExecutionUsageRepository', () => {
    let db;
    let repo;
    (0, vitest_1.beforeEach)(() => {
        db = {
            select: vitest_1.vi.fn().mockReturnThis(),
            insert: vitest_1.vi.fn().mockReturnThis(),
            from: vitest_1.vi.fn().mockReturnThis(),
            where: vitest_1.vi.fn().mockResolvedValue([]),
            values: vitest_1.vi.fn().mockReturnThis(),
            onConflictDoUpdate: vitest_1.vi.fn().mockResolvedValue(undefined),
        };
        repo = new project_execution_usage_1.ProjectExecutionUsageRepository(db);
    });
    (0, vitest_1.describe)('getCounts', () => {
        (0, vitest_1.it)('should return weekly and yearly counts from a single query', async () => {
            db.where.mockResolvedValue([
                { periodType: 'weekly', count: 7 },
                { periodType: 'yearly', count: 42 },
            ]);
            const result = await repo.getCounts('proj-123', '2026-W44', '2026');
            (0, vitest_1.expect)(db.select).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(db.where).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(result).toEqual({ weeklyCount: 7, yearlyCount: 42 });
        });
        (0, vitest_1.it)('should report 0 for a missing weekly row', async () => {
            db.where.mockResolvedValue([{ periodType: 'yearly', count: 42 }]);
            const result = await repo.getCounts('proj-123', '2026-W44', '2026');
            (0, vitest_1.expect)(result).toEqual({ weeklyCount: 0, yearlyCount: 42 });
        });
        (0, vitest_1.it)('should report 0 for a missing yearly row', async () => {
            db.where.mockResolvedValue([{ periodType: 'weekly', count: 7 }]);
            const result = await repo.getCounts('proj-123', '2026-W44', '2026');
            (0, vitest_1.expect)(result).toEqual({ weeklyCount: 7, yearlyCount: 0 });
        });
        (0, vitest_1.it)('should report 0 for both periods when no rows exist', async () => {
            db.where.mockResolvedValue([]);
            const result = await repo.getCounts('proj-123', '2026-W44', '2026');
            (0, vitest_1.expect)(result).toEqual({ weeklyCount: 0, yearlyCount: 0 });
        });
    });
    (0, vitest_1.describe)('increment', () => {
        (0, vitest_1.it)('should atomically upsert-increment with count + 1 and refresh updated_at', async () => {
            await repo.increment('proj-123', 'weekly', '2026-W44');
            (0, vitest_1.expect)(db.insert).toHaveBeenCalledWith(project_execution_usage_2.projectExecutionUsage);
            (0, vitest_1.expect)(db.values).toHaveBeenCalledWith({
                projectId: 'proj-123',
                periodType: 'weekly',
                periodKey: '2026-W44',
                count: 1,
            });
            (0, vitest_1.expect)(db.onConflictDoUpdate).toHaveBeenCalledWith({
                target: [project_execution_usage_2.projectExecutionUsage.projectId, project_execution_usage_2.projectExecutionUsage.periodType, project_execution_usage_2.projectExecutionUsage.periodKey],
                set: {
                    count: (0, drizzle_orm_1.sql) `${project_execution_usage_2.projectExecutionUsage.count} + 1`,
                    updatedAt: (0, drizzle_orm_1.sql) `now()`,
                },
            });
        });
    });
    (0, vitest_1.describe)('listCountsByProjectIds', () => {
        (0, vitest_1.it)('should return an empty Map without querying for empty input', async () => {
            const result = await repo.listCountsByProjectIds([], '2026-W44', '2026');
            (0, vitest_1.expect)(result).toBeInstanceOf(Map);
            (0, vitest_1.expect)(result.size).toBe(0);
            (0, vitest_1.expect)(db.select).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should aggregate rows into per-project weekly and yearly counts', async () => {
            db.where.mockResolvedValue([
                { projectId: 'proj-1', periodType: 'weekly', count: 5 },
                { projectId: 'proj-1', periodType: 'yearly', count: 50 },
                { projectId: 'proj-2', periodType: 'weekly', count: 2 },
            ]);
            const result = await repo.listCountsByProjectIds(['proj-1', 'proj-2'], '2026-W44', '2026');
            (0, vitest_1.expect)(db.select).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(db.where).toHaveBeenCalledTimes(1);
            (0, vitest_1.expect)(result.get('proj-1')).toEqual({ weeklyCount: 5, yearlyCount: 50 });
            (0, vitest_1.expect)(result.get('proj-2')).toEqual({ weeklyCount: 2, yearlyCount: 0 });
        });
        (0, vitest_1.it)('should default to zero counts for projects without usage rows', async () => {
            db.where.mockResolvedValue([{ projectId: 'proj-2', periodType: 'yearly', count: 3 }]);
            const result = await repo.listCountsByProjectIds(['proj-1', 'proj-2'], '2026-W44', '2026');
            (0, vitest_1.expect)(result.get('proj-1')).toEqual({ weeklyCount: 0, yearlyCount: 0 });
            (0, vitest_1.expect)(result.get('proj-2')).toEqual({ weeklyCount: 0, yearlyCount: 3 });
        });
    });
});
