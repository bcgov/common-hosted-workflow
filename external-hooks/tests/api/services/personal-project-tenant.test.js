'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const personal_project_tenant_1 = require('../../../src/api/services/personal-project-tenant');
(0, vitest_1.describe)('ensurePersonalProjectTenantMapping', () => {
  (0, vitest_1.it)('creates a generated tenant mapping when the personal project is unmapped', async () => {
    const projectRepo = {
      getPersonalProjectForUser: vitest_1.vi.fn().mockResolvedValue({ id: 'project-1' }),
    };
    const tenantProjectRelationRepository = {
      getTenantIdByProjectId: vitest_1.vi.fn().mockResolvedValue(null),
      insertIgnoreConflict: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
    await (0, personal_project_tenant_1.ensurePersonalProjectTenantMapping)({
      userId: 'user-1',
      projectRepo,
      tenantProjectRelationRepository,
      reason: 'test',
    });
    (0, vitest_1.expect)(tenantProjectRelationRepository.insertIgnoreConflict).toHaveBeenCalledTimes(1);
    (0, vitest_1.expect)(tenantProjectRelationRepository.insertIgnoreConflict).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({
        projectId: 'project-1',
        projectType: 'personal',
        tenantId: vitest_1.expect.any(String),
      }),
    );
  });
  (0, vitest_1.it)('does nothing when a tenant mapping already exists', async () => {
    const projectRepo = {
      getPersonalProjectForUser: vitest_1.vi.fn().mockResolvedValue({ id: 'project-1' }),
    };
    const tenantProjectRelationRepository = {
      getTenantIdByProjectId: vitest_1.vi.fn().mockResolvedValue('tenant-1'),
      insertIgnoreConflict: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
    await (0, personal_project_tenant_1.ensurePersonalProjectTenantMapping)({
      userId: 'user-1',
      projectRepo,
      tenantProjectRelationRepository,
      reason: 'test',
    });
    (0, vitest_1.expect)(tenantProjectRelationRepository.insertIgnoreConflict).not.toHaveBeenCalled();
  });
});
