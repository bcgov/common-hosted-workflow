import { describe, expect, it, vi } from 'vitest';
import { TenantProjectSyncService } from '../../../src/api/services/tenant-project-sync.service';

describe('TenantProjectSyncService', () => {
  it('returns the mapped project id when the n8n project exists', async () => {
    const service = new TenantProjectSyncService(
      {
        project: {
          findOneBy: vi.fn().mockResolvedValue({ id: 'project-1' }),
        },
      } as any,
      {
        tenantProjectRelation: {
          getProjectIdsByTenantId: vi.fn().mockResolvedValue(['project-1']),
          deleteByProjectId: vi.fn().mockResolvedValue(undefined),
        },
        workflowTrigger: {
          deleteByProjectId: vi.fn().mockResolvedValue(undefined),
        },
        message: {
          deleteByProjectId: vi.fn().mockResolvedValue(undefined),
        },
        actionRequest: {
          deleteByProjectId: vi.fn().mockResolvedValue(undefined),
        },
        auditLog: {
          deleteByProjectId: vi.fn().mockResolvedValue(undefined),
        },
      } as any,
      {} as any,
      {} as any,
      'global:owner',
    );

    const projectId = await (service as any).getExistingProjectIdForTenant('tenant-1');

    expect(projectId).toBe('project-1');
    expect(service['customRepositories'].workflowTrigger.deleteByProjectId).not.toHaveBeenCalled();
    expect(service['customRepositories'].message.deleteByProjectId).not.toHaveBeenCalled();
    expect(service['customRepositories'].actionRequest.deleteByProjectId).not.toHaveBeenCalled();
    expect(service['customRepositories'].auditLog.deleteByProjectId).not.toHaveBeenCalled();
    expect(service['customRepositories'].tenantProjectRelation.deleteByProjectId).not.toHaveBeenCalled();
  });

  it('deletes the dangling tenant-project relation when the n8n project no longer exists', async () => {
    const service = new TenantProjectSyncService(
      {
        project: {
          findOneBy: vi.fn().mockResolvedValue(null),
        },
      } as any,
      {
        tenantProjectRelation: {
          getProjectIdsByTenantId: vi.fn().mockResolvedValue(['project-1']),
          deleteByProjectId: vi.fn().mockResolvedValue(undefined),
        },
        workflowTrigger: {
          deleteByProjectId: vi.fn().mockResolvedValue(undefined),
        },
        message: {
          deleteByProjectId: vi.fn().mockResolvedValue(undefined),
        },
        actionRequest: {
          deleteByProjectId: vi.fn().mockResolvedValue(undefined),
        },
        auditLog: {
          deleteByProjectId: vi.fn().mockResolvedValue(undefined),
        },
      } as any,
      {} as any,
      {} as any,
      'global:owner',
    );

    const projectId = await (service as any).getExistingProjectIdForTenant('tenant-1');

    expect(projectId).toBeNull();
    expect(service['customRepositories'].workflowTrigger.deleteByProjectId).toHaveBeenCalledWith('project-1');
    expect(service['customRepositories'].message.deleteByProjectId).toHaveBeenCalledWith('project-1');
    expect(service['customRepositories'].actionRequest.deleteByProjectId).toHaveBeenCalledWith('project-1');
    expect(service['customRepositories'].auditLog.deleteByProjectId).toHaveBeenCalledWith('project-1');
    expect(service['customRepositories'].tenantProjectRelation.deleteByProjectId).toHaveBeenCalledWith('project-1');
  });
});
