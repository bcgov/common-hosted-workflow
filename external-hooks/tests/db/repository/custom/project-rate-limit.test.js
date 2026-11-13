"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const drizzle_orm_1 = require("drizzle-orm");
const project_rate_limit_1 = require("../../../../src/db/repository/custom/project-rate-limit");
const project_rate_limit_2 = require("../../../../src/db/schema/project-rate-limit");
(0, vitest_1.describe)('ProjectRateLimitRepository', () => {
    let db;
    let repo;
    (0, vitest_1.beforeEach)(() => {
        db = {
            select: vitest_1.vi.fn().mockReturnThis(),
            insert: vitest_1.vi.fn().mockReturnThis(),
            from: vitest_1.vi.fn().mockReturnThis(),
            where: vitest_1.vi.fn().mockReturnThis(),
            limit: vitest_1.vi.fn().mockReturnThis(),
            values: vitest_1.vi.fn().mockReturnThis(),
            onConflictDoUpdate: vitest_1.vi.fn().mockResolvedValue(undefined),
        };
        repo = new project_rate_limit_1.ProjectRateLimitRepository(db);
    });
    (0, vitest_1.describe)('get', () => {
        (0, vitest_1.it)('should return the configuration row when found', async () => {
            const mockRow = {
                projectId: 'proj-123',
                weeklyRateLimit: 100,
                yearlyRateLimit: 5000,
                lastAdminComment: 'Cap for FY',
                stopBehavior: 'hard_stop',
            };
            db.limit.mockResolvedValue([mockRow]);
            const result = await repo.get('proj-123');
            (0, vitest_1.expect)(db.select).toHaveBeenCalled();
            (0, vitest_1.expect)(db.where).toHaveBeenCalled();
            (0, vitest_1.expect)(result).toEqual(mockRow);
        });
        (0, vitest_1.it)('should return null when the project has no configuration', async () => {
            db.limit.mockResolvedValue([]);
            const result = await repo.get('nonexistent-project');
            (0, vitest_1.expect)(result).toBeNull();
        });
    });
    (0, vitest_1.describe)('upsert', () => {
        (0, vitest_1.it)('should insert the given values and upsert on the projectId primary key', async () => {
            const params = {
                projectId: 'proj-123',
                usesDefaultLimits: false,
                weeklyRateLimit: 100,
                yearlyRateLimit: 5000,
                lastAdminComment: 'Cap for FY',
                stopBehavior: 'hard_stop',
            };
            await repo.upsert(params);
            (0, vitest_1.expect)(db.insert).toHaveBeenCalledWith(project_rate_limit_2.projectRateLimit);
            (0, vitest_1.expect)(db.values).toHaveBeenCalledWith(params);
            (0, vitest_1.expect)(db.onConflictDoUpdate).toHaveBeenCalledWith({
                target: project_rate_limit_2.projectRateLimit.projectId,
                set: {
                    usesDefaultLimits: params.usesDefaultLimits,
                    weeklyRateLimit: params.weeklyRateLimit,
                    yearlyRateLimit: params.yearlyRateLimit,
                    lastAdminComment: params.lastAdminComment,
                    stopBehavior: params.stopBehavior,
                    updatedAt: (0, drizzle_orm_1.sql) `now()`,
                },
            });
        });
        (0, vitest_1.it)('should pass explicit nulls through to clear limits and comment', async () => {
            const params = {
                projectId: 'proj-123',
                usesDefaultLimits: true,
                weeklyRateLimit: null,
                yearlyRateLimit: null,
                lastAdminComment: null,
                stopBehavior: 'soft_stop',
            };
            await repo.upsert(params);
            (0, vitest_1.expect)(db.values).toHaveBeenCalledWith(params);
            (0, vitest_1.expect)(db.onConflictDoUpdate).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                set: {
                    usesDefaultLimits: true,
                    weeklyRateLimit: null,
                    yearlyRateLimit: null,
                    lastAdminComment: null,
                    stopBehavior: 'soft_stop',
                    updatedAt: (0, drizzle_orm_1.sql) `now()`,
                },
            }));
        });
    });
    (0, vitest_1.describe)('listByProjectIds', () => {
        (0, vitest_1.it)('should return an empty Map without querying for empty input', async () => {
            const result = await repo.listByProjectIds([]);
            (0, vitest_1.expect)(result).toBeInstanceOf(Map);
            (0, vitest_1.expect)(result.size).toBe(0);
            (0, vitest_1.expect)(db.select).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('should return a Map of projectId to configuration rows', async () => {
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
            (0, vitest_1.expect)(result).toBeInstanceOf(Map);
            (0, vitest_1.expect)(result.size).toBe(2);
            (0, vitest_1.expect)(result.get('proj-1')).toEqual(rowOne);
            (0, vitest_1.expect)(result.get('proj-2')).toEqual(rowTwo);
        });
        (0, vitest_1.it)('should filter by projectId using inArray', async () => {
            db.where.mockResolvedValue([]);
            await repo.listByProjectIds(['proj-1', 'proj-2']);
            (0, vitest_1.expect)(db.where).toHaveBeenCalledWith((0, drizzle_orm_1.inArray)(project_rate_limit_2.projectRateLimit.projectId, ['proj-1', 'proj-2']));
        });
        (0, vitest_1.it)('should return an empty Map when no rows match', async () => {
            db.where.mockResolvedValue([]);
            const result = await repo.listByProjectIds(['unknown-project']);
            (0, vitest_1.expect)(result).toBeInstanceOf(Map);
            (0, vitest_1.expect)(result.size).toBe(0);
        });
    });
});
