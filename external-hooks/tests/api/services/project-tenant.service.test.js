'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const project_tenant_service_1 = require('../../../src/api/services/project-tenant.service');
const project_rate_limit_service_1 = require('../../../src/api/services/project-rate-limit.service');
const errors_1 = require('../../../src/api/utils/errors');
function makeConfigRow(overrides = {}) {
  return {
    projectId: 'proj-001',
    usesDefaultLimits: false,
    weeklyRateLimit: null,
    yearlyRateLimit: null,
    lastAdminComment: null,
    stopBehavior: 'hard_stop',
    updatedBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
const DEFAULT_ENRICHMENT = {
  usesDefaultLimits: true,
  weeklyRateLimit: null,
  yearlyRateLimit: null,
  stopBehavior: null,
  lastAdminComment: null,
  weeklyExecutionCount: 0,
  yearlyExecutionCount: 0,
  weeklyTopupRuns: 0,
  yearlyTopupRuns: 0,
  workflowCount: 0,
  membersCount: 0,
  updatedAt: null,
  updatedByName: null,
};
function buildService({ projects, rateLimitRows, usageCounts, workflowCounts, tenantMap }) {
  const n8nRepositories = {
    project: {
      listPaginated: vitest_1.vi.fn().mockResolvedValue({ projects, totalCount: projects.length }),
      findOneBy: vitest_1.vi.fn().mockImplementation(async ({ id }) => projects.find((p) => p.id === id) ?? null),
      getPersonalProjectForUser: vitest_1.vi.fn().mockResolvedValue(null),
    },
    sharedWorkflow: { countByProjectIds: vitest_1.vi.fn().mockResolvedValue(workflowCounts) },
    projectRelation: {
      countMembersByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()),
      findAllByUser: vitest_1.vi.fn().mockResolvedValue([]),
      findProjectRole: vitest_1.vi.fn().mockResolvedValue(null),
    },
    user: {
      findUserNamesByEmails: vitest_1.vi.fn().mockImplementation(async (emails) => {
        const names = new Map();
        for (const email of emails.map((email) => email.trim().toLowerCase())) {
          if (email === 'admin@example.com') {
            names.set(email, { firstName: 'Ada', lastName: 'Lovelace' });
          }
        }
        return names;
      }),
    },
  };
  const customRepositories = {
    tenantProjectRelation: { listAll: vitest_1.vi.fn().mockResolvedValue(tenantMap) },
    projectRateLimit: { listByProjectIds: vitest_1.vi.fn().mockResolvedValue(rateLimitRows) },
    projectRateLimitDefault: { getAll: vitest_1.vi.fn().mockResolvedValue([]) },
    projectExecutionUsage: { listCountsByProjectIds: vitest_1.vi.fn().mockResolvedValue(usageCounts) },
    projectTopup: {
      sumByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()),
      sumByProjectIdsInWeeklyKeys: vitest_1.vi.fn().mockResolvedValue(new Map()),
    },
    rateLimitRequest: { getPendingByProjectId: vitest_1.vi.fn().mockResolvedValue(null) },
  };
  const projectRateLimitService = new project_rate_limit_service_1.ProjectRateLimitService(
    n8nRepositories,
    customRepositories,
  );
  const service = new project_tenant_service_1.ProjectTenantService(
    n8nRepositories,
    customRepositories,
    projectRateLimitService,
  );
  return { service, n8nRepositories, customRepositories };
}
(0, vitest_1.describe)('ProjectTenantService', () => {
  let errorSpy;
  (0, vitest_1.beforeEach)(() => {
    errorSpy = vitest_1.vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  (0, vitest_1.afterEach)(() => {
    vitest_1.vi.restoreAllMocks();
  });
  (0, vitest_1.describe)('listAllProjectsWithTenants', () => {
    (0, vitest_1.it)('merges rate-limit enrichment fields into admin project items', async () => {
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
      (0, vitest_1.expect)(customRepositories.projectRateLimit.listByProjectIds).toHaveBeenCalledWith([
        'proj-001',
        'proj-002',
      ]);
      (0, vitest_1.expect)(customRepositories.projectExecutionUsage.listCountsByProjectIds).toHaveBeenCalledTimes(1);
      (0, vitest_1.expect)(page.data).toHaveLength(2);
      (0, vitest_1.expect)(page.data[0]).toEqual({
        projectId: 'proj-001',
        projectName: 'Configured project',
        projectType: 'team',
        tenantId: 'tenant-1',
        usesDefaultLimits: false,
        weeklyRateLimit: 10,
        yearlyRateLimit: 1000,
        stopBehavior: 'hard_stop',
        lastAdminComment: 'Cap for FY',
        weeklyExecutionCount: 3,
        yearlyExecutionCount: 30,
        weeklyTopupRuns: 0,
        yearlyTopupRuns: 0,
        workflowCount: 5,
        membersCount: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
        updatedByName: null,
      });
      (0, vitest_1.expect)(page.data[1]).toEqual({
        projectId: 'proj-002',
        projectName: 'Unconfigured project',
        projectType: 'personal',
        tenantId: null,
        ...DEFAULT_ENRICHMENT,
      });
      (0, vitest_1.expect)(page.pagination).toEqual({ page: 1, pageSize: 50, totalItems: 2, totalPages: 1 });
    });
    (0, vitest_1.it)('falls back to default enrichment fields when the rate-limit source fails', async () => {
      const projects = [{ id: 'proj-001', name: 'Configured project', type: 'team' }];
      const n8nRepositories = {
        project: { listPaginated: vitest_1.vi.fn().mockResolvedValue({ projects, totalCount: 1 }) },
        sharedWorkflow: { countByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()) },
      };
      const customRepositories = {
        tenantProjectRelation: { listAll: vitest_1.vi.fn().mockResolvedValue(new Map([['proj-001', 'tenant-1']])) },
        projectRateLimit: { listByProjectIds: vitest_1.vi.fn().mockRejectedValue(new Error('custom DB outage')) },
        projectExecutionUsage: { listCountsByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()) },
        projectTopup: { sumByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()) },
      };
      const service = new project_tenant_service_1.ProjectTenantService(
        n8nRepositories,
        customRepositories,
        new project_rate_limit_service_1.ProjectRateLimitService(n8nRepositories, customRepositories),
      );
      const page = await service.listAllProjectsWithTenants(1, 50);
      (0, vitest_1.expect)(page.data).toHaveLength(1);
      (0, vitest_1.expect)(page.data[0]).toEqual({
        projectId: 'proj-001',
        projectName: 'Configured project',
        projectType: 'team',
        tenantId: 'tenant-1',
        ...DEFAULT_ENRICHMENT,
      });
      (0, vitest_1.expect)(errorSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining('rate-limit data'));
    });
    (0, vitest_1.it)('returns an empty page without enrichment queries when there are no projects', async () => {
      const { service, customRepositories } = buildService({
        projects: [],
        rateLimitRows: new Map(),
        usageCounts: new Map(),
        workflowCounts: new Map(),
        tenantMap: new Map(),
      });
      const page = await service.listAllProjectsWithTenants(1, 50);
      (0, vitest_1.expect)(page.data).toEqual([]);
      (0, vitest_1.expect)(page.pagination).toEqual({ page: 1, pageSize: 50, totalItems: 0, totalPages: 0 });
      (0, vitest_1.expect)(customRepositories.projectRateLimit.listByProjectIds).not.toHaveBeenCalled();
    });
  });
  (0, vitest_1.describe)('getProjectById', () => {
    (0, vitest_1.it)('returns a single enriched item identical to one list entry', async () => {
      const { service } = buildService({
        projects: [{ id: 'proj-001', name: 'Configured project', type: 'team' }],
        rateLimitRows: new Map([
          [
            'proj-001',
            makeConfigRow({
              weeklyRateLimit: 10,
              yearlyRateLimit: 1000,
              lastAdminComment: 'Cap for FY',
              updatedBy: 'admin@example.com',
            }),
          ],
        ]),
        usageCounts: new Map([['proj-001', { weeklyCount: 3, yearlyCount: 30 }]]),
        workflowCounts: new Map([['proj-001', 5]]),
        tenantMap: new Map([['proj-001', 'tenant-1']]),
      });
      const item = await service.getProjectById('proj-001');
      // No viewer id passed → no membership lookup, viewerRole stays null.
      (0, vitest_1.expect)(item).toEqual({
        projectId: 'proj-001',
        projectName: 'Configured project',
        projectType: 'team',
        tenantId: 'tenant-1',
        viewerRole: null,
        pendingRunRequest: null,
        usesDefaultLimits: false,
        weeklyRateLimit: 10,
        yearlyRateLimit: 1000,
        stopBehavior: 'hard_stop',
        lastAdminComment: 'Cap for FY',
        weeklyExecutionCount: 3,
        yearlyExecutionCount: 30,
        weeklyTopupRuns: 0,
        yearlyTopupRuns: 0,
        workflowCount: 5,
        membersCount: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
        updatedByName: 'A. Lovelace',
      });
    });
    (0, vitest_1.it)('throws AppError 404 for an unknown project', async () => {
      const { service } = buildService({
        projects: [],
        rateLimitRows: new Map(),
        usageCounts: new Map(),
        workflowCounts: new Map(),
        tenantMap: new Map(),
      });
      try {
        await service.getProjectById('unknown-project');
        vitest_1.expect.unreachable('Expected AppError 404');
      } catch (error) {
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(404);
        (0, vitest_1.expect)(error.message).toBe('Project not found');
      }
    });
    (0, vitest_1.it)('degrades enrichment fields when the rate-limit source fails', async () => {
      const projects = [{ id: 'proj-001', name: 'Configured project', type: 'team' }];
      const n8nRepositories = {
        project: {
          listPaginated: vitest_1.vi.fn().mockResolvedValue({ projects, totalCount: 1 }),
          findOneBy: vitest_1.vi.fn().mockResolvedValue(projects[0]),
        },
        sharedWorkflow: { countByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()) },
        user: { findUserNamesByEmails: vitest_1.vi.fn().mockResolvedValue(new Map()) },
      };
      const customRepositories = {
        tenantProjectRelation: { listAll: vitest_1.vi.fn().mockResolvedValue(new Map([['proj-001', 'tenant-1']])) },
        projectRateLimit: { listByProjectIds: vitest_1.vi.fn().mockRejectedValue(new Error('custom DB outage')) },
        projectExecutionUsage: { listCountsByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()) },
        projectTopup: { sumByProjectIds: vitest_1.vi.fn().mockResolvedValue(new Map()) },
        rateLimitRequest: { getPendingByProjectId: vitest_1.vi.fn().mockResolvedValue(null) },
      };
      const service = new project_tenant_service_1.ProjectTenantService(
        n8nRepositories,
        customRepositories,
        new project_rate_limit_service_1.ProjectRateLimitService(n8nRepositories, customRepositories),
      );
      const item = await service.getProjectById('proj-001');
      (0, vitest_1.expect)(item).toEqual({
        projectId: 'proj-001',
        projectName: 'Configured project',
        projectType: 'team',
        tenantId: 'tenant-1',
        ...DEFAULT_ENRICHMENT,
        pendingRunRequest: null,
        viewerRole: null,
      });
    });
    (0, vitest_1.it)('resolves the viewer team-project role from the project relation', async () => {
      const { service, n8nRepositories } = buildService({
        projects: [{ id: 'proj-001', name: 'Shared project', type: 'team' }],
        rateLimitRows: new Map(),
        usageCounts: new Map(),
        workflowCounts: new Map(),
        tenantMap: new Map(),
      });
      n8nRepositories.projectRelation.findProjectRole.mockResolvedValue('project:editor');
      const item = await service.getProjectById('proj-001', 'user-77');
      (0, vitest_1.expect)(item.viewerRole).toBe('project:editor');
      (0, vitest_1.expect)(n8nRepositories.projectRelation.findProjectRole).toHaveBeenCalledWith({
        userId: 'user-77',
        projectId: 'proj-001',
      });
      (0, vitest_1.expect)(n8nRepositories.project.getPersonalProjectForUser).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('normalizes a Role-entity shaped relation result to the slug', async () => {
      const { service, n8nRepositories } = buildService({
        projects: [{ id: 'proj-001', name: 'Shared project', type: 'team' }],
        rateLimitRows: new Map(),
        usageCounts: new Map(),
        workflowCounts: new Map(),
        tenantMap: new Map(),
      });
      // n8n's findProjectRole returns the raw column value in practice, but the
      // extractor also tolerates a loaded Role entity.
      n8nRepositories.projectRelation.findProjectRole.mockResolvedValue({ slug: 'project:admin' });
      const item = await service.getProjectById('proj-001', 'user-77');
      (0, vitest_1.expect)(item.viewerRole).toBe('project:admin');
    });
    (0, vitest_1.it)("falls back to the project:personalOwner slug for the viewer's personal project", async () => {
      const { service, n8nRepositories } = buildService({
        projects: [{ id: 'proj-010', name: 'My personal project', type: 'personal' }],
        rateLimitRows: new Map(),
        usageCounts: new Map(),
        workflowCounts: new Map(),
        tenantMap: new Map(),
      });
      n8nRepositories.projectRelation.findProjectRole.mockResolvedValue(null);
      n8nRepositories.project.getPersonalProjectForUser.mockResolvedValue({ id: 'proj-010' });
      const item = await service.getProjectById('proj-010', 'user-77');
      (0, vitest_1.expect)(item.viewerRole).toBe('project:personalOwner');
    });
    (0, vitest_1.it)('returns null for a viewer without a membership — including platform admins', async () => {
      const { service, n8nRepositories } = buildService({
        projects: [{ id: 'proj-001', name: 'Shared project', type: 'team' }],
        rateLimitRows: new Map(),
        usageCounts: new Map(),
        workflowCounts: new Map(),
        tenantMap: new Map(),
      });
      n8nRepositories.projectRelation.findProjectRole.mockResolvedValue(null);
      // Personal project exists but is a different one.
      n8nRepositories.project.getPersonalProjectForUser.mockResolvedValue({ id: 'proj-999' });
      const item = await service.getProjectById('proj-001', 'admin-n8n-user');
      (0, vitest_1.expect)(item.viewerRole).toBeNull();
    });
  });
  (0, vitest_1.describe)('listProjectsWithTenantsForUser', () => {
    (0, vitest_1.it)('scopes listPaginated to the projects the user can access and enriches identically', async () => {
      const { service, n8nRepositories, customRepositories } = buildService({
        projects: [{ id: 'proj-010', name: 'My personal project', type: 'personal' }],
        rateLimitRows: new Map(),
        usageCounts: new Map(),
        workflowCounts: new Map(),
        tenantMap: new Map([['proj-010', 'tenant-9']]),
      });
      n8nRepositories.projectRelation.findAllByUser.mockResolvedValue([{ projectId: 'proj-001' }]);
      n8nRepositories.project.getPersonalProjectForUser.mockResolvedValue({ id: 'proj-010' });
      const page = await service.listProjectsWithTenantsForUser(2, 10, { search: 'personal' }, 'user-77');
      (0, vitest_1.expect)(n8nRepositories.project.listPaginated).toHaveBeenCalledWith(2, 10, {
        search: 'personal',
        ids: ['proj-001', 'proj-010'],
      });
      (0, vitest_1.expect)(page.data).toEqual([
        {
          projectId: 'proj-010',
          projectName: 'My personal project',
          projectType: 'personal',
          tenantId: 'tenant-9',
          ...DEFAULT_ENRICHMENT,
        },
      ]);
      (0, vitest_1.expect)(page.pagination).toEqual({ page: 2, pageSize: 10, totalItems: 1, totalPages: 1 });
      (0, vitest_1.expect)(customRepositories.projectRateLimit.listByProjectIds).toHaveBeenCalledWith(['proj-010']);
    });
    (0, vitest_1.it)('passes an empty id list when the user has no relations and no personal project', async () => {
      const { service, n8nRepositories } = buildService({
        projects: [],
        rateLimitRows: new Map(),
        usageCounts: new Map(),
        workflowCounts: new Map(),
        tenantMap: new Map(),
      });
      await service.listProjectsWithTenantsForUser(1, 25, undefined, 'user-with-nothing');
      (0, vitest_1.expect)(n8nRepositories.project.listPaginated).toHaveBeenCalledWith(1, 25, { ids: [] });
    });
  });
  (0, vitest_1.describe)('assertUserProjectAccess', () => {
    (0, vitest_1.it)('resolves when the user holds a project role', async () => {
      const { service, n8nRepositories } = buildService({
        projects: [{ id: 'proj-001', name: 'Shared project', type: 'team' }],
        rateLimitRows: new Map(),
        usageCounts: new Map(),
        workflowCounts: new Map(),
        tenantMap: new Map(),
      });
      n8nRepositories.projectRelation.findProjectRole.mockResolvedValue('projectAdmin');
      await (0, vitest_1.expect)(service.assertUserProjectAccess('proj-001', 'user-77')).resolves.toBeUndefined();
      (0, vitest_1.expect)(n8nRepositories.project.getPersonalProjectForUser).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('resolves for the owner of the personal project', async () => {
      const { service, n8nRepositories } = buildService({
        projects: [{ id: 'proj-010', name: 'My personal project', type: 'personal' }],
        rateLimitRows: new Map(),
        usageCounts: new Map(),
        workflowCounts: new Map(),
        tenantMap: new Map(),
      });
      n8nRepositories.projectRelation.findProjectRole.mockResolvedValue(null);
      n8nRepositories.project.getPersonalProjectForUser.mockResolvedValue({ id: 'proj-010' });
      await (0, vitest_1.expect)(service.assertUserProjectAccess('proj-010', 'user-77')).resolves.toBeUndefined();
    });
    (0, vitest_1.it)(
      'throws AppError 403 when the user has neither a project role nor the personal project',
      async () => {
        const { service, n8nRepositories } = buildService({
          projects: [{ id: 'proj-001', name: 'Other tenant project', type: 'team' }],
          rateLimitRows: new Map(),
          usageCounts: new Map(),
          workflowCounts: new Map(),
          tenantMap: new Map(),
        });
        n8nRepositories.projectRelation.findProjectRole.mockResolvedValue(null);
        n8nRepositories.project.getPersonalProjectForUser.mockResolvedValue({ id: 'proj-010' });
        try {
          await service.assertUserProjectAccess('proj-001', 'user-77');
          vitest_1.expect.unreachable('Expected AppError 403');
        } catch (error) {
          (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
          (0, vitest_1.expect)(error.statusCode).toBe(403);
          (0, vitest_1.expect)(error.message).toBe('You do not have access to this project');
        }
      },
    );
    (0, vitest_1.it)('throws AppError 404 for an unknown project without consulting relations', async () => {
      const { service, n8nRepositories } = buildService({
        projects: [],
        rateLimitRows: new Map(),
        usageCounts: new Map(),
        workflowCounts: new Map(),
        tenantMap: new Map(),
      });
      try {
        await service.assertUserProjectAccess('unknown-project', 'user-77');
        vitest_1.expect.unreachable('Expected AppError 404');
      } catch (error) {
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(404);
        (0, vitest_1.expect)(error.message).toBe('Project not found');
      }
      (0, vitest_1.expect)(n8nRepositories.projectRelation.findProjectRole).not.toHaveBeenCalled();
    });
  });
});
