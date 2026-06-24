import { describe, it, expect, vi } from 'vitest';
import { ProjectRepository } from '../../../../src/db/repository/n8n/project';
import type { BaseN8nProjectRepository } from '../../../../src/api/types/n8n-adapters';

describe('ProjectRepository', () => {
  describe('listPaginated', () => {
    function createMockBaseRepo(
      countRows: Array<Record<string, unknown>> = [{ count: '5' }],
      dataRows: Array<Record<string, unknown>> = [],
    ) {
      const manager = {
        query: vi.fn(),
      };
      manager.query.mockResolvedValueOnce(countRows).mockResolvedValueOnce(dataRows);

      return {
        metadata: { tableName: 'project', columns: [] },
        manager,
        findOneBy: vi.fn(),
        getPersonalProjectForUser: vi.fn(),
        getPersonalProjectForUserOrFail: vi.fn(),
        create: vi.fn(),
        save: vi.fn(),
      } as unknown as BaseN8nProjectRepository;
    }

    it('returns projects and totalCount for a valid page', async () => {
      const rows = [
        { id: 'p1', name: 'Alpha', type: 'team' },
        { id: 'p2', name: 'Beta', type: 'personal' },
      ];
      const baseRepo = createMockBaseRepo([{ count: '10' }], rows);
      const repo = new ProjectRepository(baseRepo);

      const result = await repo.listPaginated(1, 25);

      expect(result.totalCount).toBe(10);
      expect(result.projects).toEqual([
        { id: 'p1', name: 'Alpha', type: 'team' },
        { id: 'p2', name: 'Beta', type: 'personal' },
      ]);
    });

    it('calculates correct offset for page 2', async () => {
      const baseRepo = createMockBaseRepo([{ count: '50' }], []);
      const repo = new ProjectRepository(baseRepo);

      await repo.listPaginated(2, 25);

      const queryCalls = (baseRepo.manager.query as ReturnType<typeof vi.fn>).mock.calls;
      // Second call is the data query with LIMIT/OFFSET
      expect(queryCalls[1][1]).toEqual([25, 25]); // [pageSize, offset]
    });

    it('calculates correct offset for page 3 with pageSize 10', async () => {
      const baseRepo = createMockBaseRepo([{ count: '30' }], []);
      const repo = new ProjectRepository(baseRepo);

      await repo.listPaginated(3, 10);

      const queryCalls = (baseRepo.manager.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(queryCalls[1][1]).toEqual([10, 20]); // [pageSize, offset = (3-1)*10]
    });

    it('uses the table name from metadata in SQL queries', async () => {
      const baseRepo = createMockBaseRepo();
      const repo = new ProjectRepository(baseRepo);

      await repo.listPaginated(1, 25);

      const queryCalls = (baseRepo.manager.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(queryCalls[0][0]).toContain('project');
      expect(queryCalls[1][0]).toContain('project');
    });

    it('converts row values to strings', async () => {
      const rows = [{ id: 123, name: 456, type: 789 }];
      const baseRepo = createMockBaseRepo([{ count: '1' }], rows);
      const repo = new ProjectRepository(baseRepo);

      const result = await repo.listPaginated(1, 25);

      expect(result.projects[0]).toEqual({ id: '123', name: '456', type: '789' });
    });

    it('returns empty projects array when no rows exist', async () => {
      const baseRepo = createMockBaseRepo([{ count: '0' }], []);
      const repo = new ProjectRepository(baseRepo);

      const result = await repo.listPaginated(1, 25);

      expect(result.totalCount).toBe(0);
      expect(result.projects).toEqual([]);
    });
  });
});
