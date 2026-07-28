import { describe, expect, it, vi } from 'vitest';
import { ensurePersonalProjectTenantMapping } from '../../../src/api/services/personal-project-tenant';

describe('ensurePersonalProjectTenantMapping', () => {
  it('creates a generated tenant mapping when the personal project is unmapped', async () => {
    const projectRepo = {
      getPersonalProjectForUser: vi.fn().mockResolvedValue({ id: 'project-1' }),
    } as any;
    const tenantProjectRelationRepository = {
      getTenantIdByProjectId: vi.fn().mockResolvedValue(null),
      insertIgnoreConflict: vi.fn().mockResolvedValue(undefined),
    } as any;

    await ensurePersonalProjectTenantMapping({
      userId: 'user-1',
      projectRepo,
      tenantProjectRelationRepository,
      reason: 'test',
    });

    expect(tenantProjectRelationRepository.insertIgnoreConflict).toHaveBeenCalledTimes(1);
    expect(tenantProjectRelationRepository.insertIgnoreConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        tenantId: expect.any(String),
      }),
    );
  });

  it('does nothing when a tenant mapping already exists', async () => {
    const projectRepo = {
      getPersonalProjectForUser: vi.fn().mockResolvedValue({ id: 'project-1' }),
    } as any;
    const tenantProjectRelationRepository = {
      getTenantIdByProjectId: vi.fn().mockResolvedValue('tenant-1'),
      insertIgnoreConflict: vi.fn().mockResolvedValue(undefined),
    } as any;

    await ensurePersonalProjectTenantMapping({
      userId: 'user-1',
      projectRepo,
      tenantProjectRelationRepository,
      reason: 'test',
    });

    expect(tenantProjectRelationRepository.insertIgnoreConflict).not.toHaveBeenCalled();
  });
});
