'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const tenant_project_relation_1 = require('../../../../src/db/repository/custom/tenant-project-relation');
(0, vitest_1.describe)('TenantProjectRelationRepository', () => {
  let db;
  let repo;
  (0, vitest_1.beforeEach)(() => {
    db = {
      select: vitest_1.vi.fn().mockReturnThis(),
      selectDistinct: vitest_1.vi.fn().mockReturnThis(),
      insert: vitest_1.vi.fn().mockReturnThis(),
      delete: vitest_1.vi.fn().mockReturnThis(),
      from: vitest_1.vi.fn().mockReturnThis(),
      where: vitest_1.vi.fn().mockReturnThis(),
      limit: vitest_1.vi.fn().mockReturnThis(),
      values: vitest_1.vi.fn().mockReturnThis(),
      onConflictDoNothing: vitest_1.vi.fn().mockReturnThis(),
      onConflictDoUpdate: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
    repo = new tenant_project_relation_1.TenantProjectRelationRepository(db);
  });
  (0, vitest_1.describe)('deleteByProjectId', () => {
    (0, vitest_1.it)('should delete the mapping for the given project ID', async () => {
      db.where.mockResolvedValue(undefined);
      await repo.deleteByProjectId('proj-123');
      (0, vitest_1.expect)(db.delete).toHaveBeenCalled();
      (0, vitest_1.expect)(db.where).toHaveBeenCalled();
    });
  });
  (0, vitest_1.describe)('upsertByProjectId', () => {
    (0, vitest_1.it)('should insert with onConflictDoUpdate on projectId including projectType', async () => {
      const params = { tenantId: 'tenant-abc', projectId: 'proj-123' };
      await repo.upsertByProjectId(params);
      (0, vitest_1.expect)(db.insert).toHaveBeenCalled();
      (0, vitest_1.expect)(db.values).toHaveBeenCalledWith(params);
      (0, vitest_1.expect)(db.onConflictDoUpdate).toHaveBeenCalledWith(
        vitest_1.expect.objectContaining({
          set: { tenantId: params.tenantId, projectType: null },
        }),
      );
    });
    (0, vitest_1.it)('should include projectType in the conflict update when provided', async () => {
      const params = { tenantId: 'tenant-abc', projectId: 'proj-123', projectType: 'personal' };
      await repo.upsertByProjectId(params);
      (0, vitest_1.expect)(db.onConflictDoUpdate).toHaveBeenCalledWith(
        vitest_1.expect.objectContaining({
          set: { tenantId: params.tenantId, projectType: 'personal' },
        }),
      );
    });
  });
  (0, vitest_1.describe)('listAll', () => {
    (0, vitest_1.it)('should return a Map of projectId to tenantId', async () => {
      const mockRows = [
        { projectId: 'proj-1', tenantId: 'tenant-a' },
        { projectId: 'proj-2', tenantId: 'tenant-b' },
      ];
      db.from.mockResolvedValue(mockRows);
      const result = await repo.listAll();
      (0, vitest_1.expect)(result).toBeInstanceOf(Map);
      (0, vitest_1.expect)(result.size).toBe(2);
      (0, vitest_1.expect)(result.get('proj-1')).toBe('tenant-a');
      (0, vitest_1.expect)(result.get('proj-2')).toBe('tenant-b');
    });
    (0, vitest_1.it)('should return an empty Map when no relations exist', async () => {
      db.from.mockResolvedValue([]);
      const result = await repo.listAll();
      (0, vitest_1.expect)(result).toBeInstanceOf(Map);
      (0, vitest_1.expect)(result.size).toBe(0);
    });
  });
  (0, vitest_1.describe)('getRowByTenantId', () => {
    (0, vitest_1.it)('should return the relation row when found', async () => {
      const mockRow = { tenantId: 'tenant-abc', projectId: 'proj-123', projectType: 'team' };
      db.limit.mockResolvedValue([mockRow]);
      const result = await repo.getRowByTenantId('tenant-abc');
      (0, vitest_1.expect)(db.select).toHaveBeenCalled();
      (0, vitest_1.expect)(db.where).toHaveBeenCalled();
      (0, vitest_1.expect)(result).toEqual(mockRow);
    });
    (0, vitest_1.it)('should return null when no row exists for the tenant', async () => {
      db.limit.mockResolvedValue([]);
      const result = await repo.getRowByTenantId('nonexistent-tenant');
      (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)('should return row with null projectType for personal projects', async () => {
      const mockRow = { tenantId: 'tenant-abc', projectId: 'proj-123', projectType: 'personal' };
      db.limit.mockResolvedValue([mockRow]);
      const result = await repo.getRowByTenantId('tenant-abc');
      (0, vitest_1.expect)(result?.projectType).toBe('personal');
    });
  });
});
