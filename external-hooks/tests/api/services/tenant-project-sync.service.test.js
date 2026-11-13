"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const tenant_project_sync_service_1 = require("../../../src/api/services/tenant-project-sync.service");
(0, vitest_1.describe)('TenantProjectSyncService', () => {
    (0, vitest_1.it)('returns the mapped project id when the n8n project exists', async () => {
        const service = new tenant_project_sync_service_1.TenantProjectSyncService({
            project: {
                findOneBy: vitest_1.vi.fn().mockResolvedValue({ id: 'project-1' }),
            },
        }, {
            tenantProjectRelation: {
                getProjectIdsByTenantId: vitest_1.vi.fn().mockResolvedValue(['project-1']),
                deleteByProjectId: vitest_1.vi.fn().mockResolvedValue(undefined),
            },
            workflowTrigger: {
                deleteByProjectId: vitest_1.vi.fn().mockResolvedValue(undefined),
            },
            message: {
                deleteByProjectId: vitest_1.vi.fn().mockResolvedValue(undefined),
            },
            actionRequest: {
                deleteByProjectId: vitest_1.vi.fn().mockResolvedValue(undefined),
            },
            auditLog: {
                deleteByProjectId: vitest_1.vi.fn().mockResolvedValue(undefined),
            },
        }, {}, {}, 'global:owner');
        const projectId = await service.getExistingProjectIdForTenant('tenant-1');
        (0, vitest_1.expect)(projectId).toBe('project-1');
        (0, vitest_1.expect)(service['customRepositories'].workflowTrigger.deleteByProjectId).not.toHaveBeenCalled();
        (0, vitest_1.expect)(service['customRepositories'].message.deleteByProjectId).not.toHaveBeenCalled();
        (0, vitest_1.expect)(service['customRepositories'].actionRequest.deleteByProjectId).not.toHaveBeenCalled();
        (0, vitest_1.expect)(service['customRepositories'].auditLog.deleteByProjectId).not.toHaveBeenCalled();
        (0, vitest_1.expect)(service['customRepositories'].tenantProjectRelation.deleteByProjectId).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('deletes the dangling tenant-project relation when the n8n project no longer exists', async () => {
        const service = new tenant_project_sync_service_1.TenantProjectSyncService({
            project: {
                findOneBy: vitest_1.vi.fn().mockResolvedValue(null),
            },
        }, {
            tenantProjectRelation: {
                getProjectIdsByTenantId: vitest_1.vi.fn().mockResolvedValue(['project-1']),
                deleteByProjectId: vitest_1.vi.fn().mockResolvedValue(undefined),
            },
            workflowTrigger: {
                deleteByProjectId: vitest_1.vi.fn().mockResolvedValue(undefined),
            },
            message: {
                deleteByProjectId: vitest_1.vi.fn().mockResolvedValue(undefined),
            },
            actionRequest: {
                deleteByProjectId: vitest_1.vi.fn().mockResolvedValue(undefined),
            },
            auditLog: {
                deleteByProjectId: vitest_1.vi.fn().mockResolvedValue(undefined),
            },
        }, {}, {}, 'global:owner');
        const projectId = await service.getExistingProjectIdForTenant('tenant-1');
        (0, vitest_1.expect)(projectId).toBeNull();
        (0, vitest_1.expect)(service['customRepositories'].workflowTrigger.deleteByProjectId).toHaveBeenCalledWith('project-1');
        (0, vitest_1.expect)(service['customRepositories'].message.deleteByProjectId).toHaveBeenCalledWith('project-1');
        (0, vitest_1.expect)(service['customRepositories'].actionRequest.deleteByProjectId).toHaveBeenCalledWith('project-1');
        (0, vitest_1.expect)(service['customRepositories'].auditLog.deleteByProjectId).toHaveBeenCalledWith('project-1');
        (0, vitest_1.expect)(service['customRepositories'].tenantProjectRelation.deleteByProjectId).toHaveBeenCalledWith('project-1');
    });
});
