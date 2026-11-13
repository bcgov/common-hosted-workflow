"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const project_1 = require("../../../../src/db/repository/n8n/project");
(0, vitest_1.describe)('ProjectRepository', () => {
    (0, vitest_1.describe)('listPaginated', () => {
        function createMockBaseRepo(countRows = [{ count: '5' }], dataRows = []) {
            const manager = {
                query: vitest_1.vi.fn(),
            };
            manager.query.mockResolvedValueOnce(countRows).mockResolvedValueOnce(dataRows);
            return {
                metadata: { tableName: 'project', columns: [] },
                manager,
                findOneBy: vitest_1.vi.fn(),
                getPersonalProjectForUser: vitest_1.vi.fn(),
                getPersonalProjectForUserOrFail: vitest_1.vi.fn(),
                create: vitest_1.vi.fn(),
                save: vitest_1.vi.fn(),
            };
        }
        (0, vitest_1.it)('returns projects and totalCount for a valid page', async () => {
            const rows = [
                { id: 'p1', name: 'Alpha', type: 'team' },
                { id: 'p2', name: 'Beta', type: 'personal' },
            ];
            const baseRepo = createMockBaseRepo([{ count: '10' }], rows);
            const repo = new project_1.ProjectRepository(baseRepo);
            const result = await repo.listPaginated(1, 25);
            (0, vitest_1.expect)(result.totalCount).toBe(10);
            (0, vitest_1.expect)(result.projects).toEqual([
                { id: 'p1', name: 'Alpha', type: 'team' },
                { id: 'p2', name: 'Beta', type: 'personal' },
            ]);
        });
        (0, vitest_1.it)('calculates correct offset for page 2', async () => {
            const baseRepo = createMockBaseRepo([{ count: '50' }], []);
            const repo = new project_1.ProjectRepository(baseRepo);
            await repo.listPaginated(2, 25);
            const queryCalls = baseRepo.manager.query.mock.calls;
            // Second call is the data query with LIMIT/OFFSET
            (0, vitest_1.expect)(queryCalls[1][1]).toEqual([25, 25]); // [pageSize, offset]
        });
        (0, vitest_1.it)('calculates correct offset for page 3 with pageSize 10', async () => {
            const baseRepo = createMockBaseRepo([{ count: '30' }], []);
            const repo = new project_1.ProjectRepository(baseRepo);
            await repo.listPaginated(3, 10);
            const queryCalls = baseRepo.manager.query.mock.calls;
            (0, vitest_1.expect)(queryCalls[1][1]).toEqual([10, 20]); // [pageSize, offset = (3-1)*10]
        });
        (0, vitest_1.it)('uses the table name from metadata in SQL queries', async () => {
            const baseRepo = createMockBaseRepo();
            const repo = new project_1.ProjectRepository(baseRepo);
            await repo.listPaginated(1, 25);
            const queryCalls = baseRepo.manager.query.mock.calls;
            (0, vitest_1.expect)(queryCalls[0][0]).toContain('project');
            (0, vitest_1.expect)(queryCalls[1][0]).toContain('project');
        });
        (0, vitest_1.it)('converts row values to strings', async () => {
            const rows = [{ id: 123, name: 456, type: 789 }];
            const baseRepo = createMockBaseRepo([{ count: '1' }], rows);
            const repo = new project_1.ProjectRepository(baseRepo);
            const result = await repo.listPaginated(1, 25);
            (0, vitest_1.expect)(result.projects[0]).toEqual({ id: '123', name: '456', type: '789' });
        });
        (0, vitest_1.it)('returns empty projects array when no rows exist', async () => {
            const baseRepo = createMockBaseRepo([{ count: '0' }], []);
            const repo = new project_1.ProjectRepository(baseRepo);
            const result = await repo.listPaginated(1, 25);
            (0, vitest_1.expect)(result.totalCount).toBe(0);
            (0, vitest_1.expect)(result.projects).toEqual([]);
        });
        (0, vitest_1.it)('restricts count and data queries to the given project ids', async () => {
            const rows = [{ id: 'p2', name: 'Beta', type: 'team' }];
            const baseRepo = createMockBaseRepo([{ count: '1' }], rows);
            const repo = new project_1.ProjectRepository(baseRepo);
            const result = await repo.listPaginated(1, 25, { ids: ['p2', 'p9'] });
            const queryCalls = baseRepo.manager.query.mock.calls;
            (0, vitest_1.expect)(queryCalls[0][0]).toContain('id IN ($1, $2)');
            (0, vitest_1.expect)(queryCalls[0][1]).toEqual(['p2', 'p9']);
            (0, vitest_1.expect)(queryCalls[1][0]).toContain('id IN ($1, $2)');
            // Ids first, then LIMIT/OFFSET parameters.
            (0, vitest_1.expect)(queryCalls[1][1]).toEqual(['p2', 'p9', 25, 0]);
            (0, vitest_1.expect)(result.projects).toEqual([{ id: 'p2', name: 'Beta', type: 'team' }]);
        });
        (0, vitest_1.it)('combines the ids filter with the type and search filters', async () => {
            const baseRepo = createMockBaseRepo([{ count: '0' }], []);
            const repo = new project_1.ProjectRepository(baseRepo);
            await repo.listPaginated(1, 25, { ids: ['p1'], type: 'team', search: 'beta' });
            const queryCalls = baseRepo.manager.query.mock.calls;
            (0, vitest_1.expect)(queryCalls[0][0]).toContain('id IN ($1) AND type = $2 AND LOWER(name) LIKE $3');
            (0, vitest_1.expect)(queryCalls[0][1]).toEqual(['p1', 'team', '%beta%']);
            (0, vitest_1.expect)(queryCalls[1][1]).toEqual(['p1', 'team', '%beta%', 25, 0]);
        });
        (0, vitest_1.it)('short-circuits to an empty page when the id list is empty', async () => {
            const baseRepo = createMockBaseRepo();
            const repo = new project_1.ProjectRepository(baseRepo);
            const result = await repo.listPaginated(1, 25, { ids: [] });
            (0, vitest_1.expect)(result).toEqual({ projects: [], totalCount: 0 });
            (0, vitest_1.expect)(baseRepo.manager.query).not.toHaveBeenCalled();
        });
    });
});
