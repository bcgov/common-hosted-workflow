import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectTenantService } from '../../../src/api/services/project-tenant.service';
import { ProjectRateLimitService } from '../../../src/api/services/project-rate-limit.service';
import type { ProjectRateLimit } from '../../../src/db/schema/project-rate-limit';

function makeConfigRow(overrides: Partial<ProjectRateLimit> = {}): ProjectRateLimit {
  return {
    projectId: 'proj-001',
    weeklyRateLimit: null,
    yearlyRateLimit: null,
    lastAdminComment: null,
    stopBehavior: 'hard_stop',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const DEFAULT_ENRICHMENT = {
  weeklyRateLimit: null,
  yearlyRateLimit: null,
  stopBehavior: null,
  lastAdminComment: null,
  weeklyExecutionCount: 0,
  yearlyExecutionCount: 0,
  workflowCount: 0,
};

function buildService({
  projects,
  rateLimitRows,
  usageCounts,
  workflowCounts,
  tenantMap,
}: {
  projects: Array<{ id: string; name: string; type: string }>;
  rateLimitRows: Map<string, ProjectRateLimit>;
  usageCounts: Map<string, { weeklyCount: number; yearlyCount: number }>;
  workflowCounts: Map<string, number>;
  tenantMap: Map<string, string>;
}) {
  const n8nRepositories = {
    project: { listPaginated: vi.fn().mockResolvedValue({ projects, totalCount: projects.length }) },
    sharedWorkflow: { countByProjectIds: vi.fn().mockResolvedValue(workflowCounts) },
  };
  const customRepositories = {
    tenantProjectRelation: { listAll: vi.fn().mockResolvedValue(tenantMap) },
    projectRateLimit: { listByProjectIds: vi.fn().mockResolvedValue(rateLimitRows) },
    projectExecutionUsage: { listCountsByProjectIds: vi.fn().mockResolvedValue(usageCounts) },
  };
  const projectRateLimitService = new ProjectRateLimitService(n8nRepositories as any, customRepositories as any);
  const service = new ProjectTenantService(
    n8nRepositories as any,
    customRepositories as any,
    {} as any,
    {} as any,
    projectRateLimitService,
  );
  return { service, n8nRepositories, customRepositories };
}

describe('ProjectTenantService', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listAllProjectsWithTenants', () => {
    it('merges rate-limit enrichment fields into admin project items', async () => {
      const { service, customRepositories } = buildService({
        projects: [
          { id: 'proj-001', name: 'Configured project', type: 'team' },
          { id: 'proj-002', name: 'Unconfigured project', type: 'personal' },
        ],
        rateLimitRows: new Map([
          [
            'proj-001',
            makeConfigRow({
              weeklyRateLimit: 10,
              yearlyRateLimit: 1000,
              lastAdminComment: 'Cap for FY',
              stopBehavior: 'hard_stop',
            }),
          ],
        ]),
        usageCounts: new Map([['proj-001', { weeklyCount: 3, yearlyCount: 30 }]]),
        workflowCounts: new Map([['proj-001', 5]]),
        tenantMap: new Map([['proj-001', 'tenant-1']]),
      });

      const page = await service.listAllProjectsWithTenants(1, 50);

      // Batched enrichment: one query per source, covering the page's project ids.
      expect(customRepositories.projectRateLimit.listByProjectIds).toHaveBeenCalledWith(['proj-001', 'proj-002']);
      expect(customRepositories.projectExecutionUsage.listCountsByProjectIds).toHaveBeenCalledTimes(1);
      expect(page.data).toHaveLength(2);
      expect(page.data[0]).toEqual({
        projectId: 'proj-001',
        projectName: 'Configured project',
        projectType: 'team',
        tenantId: 'tenant-1',
        weeklyRateLimit: 10,
        yearlyRateLimit: 1000,
        stopBehavior: 'hard_stop',
        lastAdminComment: 'Cap for FY',
        weeklyExecutionCount: 3,
        yearlyExecutionCount: 30,
        workflowCount: 5,
      });
      expect(page.data[1]).toEqual({
        projectId: 'proj-002',
        projectName: 'Unconfigured project',
        projectType: 'personal',
        tenantId: null,
        ...DEFAULT_ENRICHMENT,
      });
      expect(page.pagination).toEqual({ page: 1, pageSize: 50, totalItems: 2, totalPages: 1 });
    });

    it('falls back to default enrichment fields when the rate-limit source fails', async () => {
      const projects = [{ id: 'proj-001', name: 'Configured project', type: 'team' }];
      const n8nRepositories = {
        project: { listPaginated: vi.fn().mockResolvedValue({ projects, totalCount: 1 }) },
        sharedWorkflow: { countByProjectIds: vi.fn().mockResolvedValue(new Map()) },
      };
      const customRepositories = {
        tenantProjectRelation: { listAll: vi.fn().mockResolvedValue(new Map([['proj-001', 'tenant-1']])) },
        projectRateLimit: { listByProjectIds: vi.fn().mockRejectedValue(new Error('custom DB outage')) },
        projectExecutionUsage: { listCountsByProjectIds: vi.fn().mockResolvedValue(new Map()) },
      };
      const service = new ProjectTenantService(
        n8nRepositories as any,
        customRepositories as any,
        {} as any,
        {} as any,
        new ProjectRateLimitService(n8nRepositories as any, customRepositories as any),
      );

      const page = await service.listAllProjectsWithTenants(1, 50);

      expect(page.data).toHaveLength(1);
      expect(page.data[0]).toEqual({
        projectId: 'proj-001',
        projectName: 'Configured project',
        projectType: 'team',
        tenantId: 'tenant-1',
        ...DEFAULT_ENRICHMENT,
      });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('rate-limit data'));
    });

    it('returns an empty page without enrichment queries when there are no projects', async () => {
      const { service, customRepositories } = buildService({
        projects: [],
        rateLimitRows: new Map(),
        usageCounts: new Map(),
        workflowCounts: new Map(),
        tenantMap: new Map(),
      });

      const page = await service.listAllProjectsWithTenants(1, 50);

      expect(page.data).toEqual([]);
      expect(page.pagination).toEqual({ page: 1, pageSize: 50, totalItems: 0, totalPages: 0 });
      expect(customRepositories.projectRateLimit.listByProjectIds).not.toHaveBeenCalled();
    });
  });
});
