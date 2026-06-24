import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantProjectRelationRepository } from '../../../../src/db/repository/custom/tenant-project-relation';

describe('TenantProjectRelationRepository', () => {
  let db: any;
  let repo: TenantProjectRelationRepository;

  beforeEach(() => {
    db = {
      select: vi.fn().mockReturnThis(),
      selectDistinct: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    };
    repo = new TenantProjectRelationRepository(db);
  });

  describe('deleteByProjectId', () => {
    it('should delete the mapping for the given project ID', async () => {
      db.where.mockResolvedValue(undefined);

      await repo.deleteByProjectId('proj-123');

      expect(db.delete).toHaveBeenCalled();
      expect(db.where).toHaveBeenCalled();
    });
  });

  describe('upsertByProjectId', () => {
    it('should insert with onConflictDoUpdate on projectId', async () => {
      const params = { tenantId: 'tenant-abc', projectId: 'proj-123' };

      await repo.upsertByProjectId(params);

      expect(db.insert).toHaveBeenCalled();
      expect(db.values).toHaveBeenCalledWith(params);
      expect(db.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: { tenantId: params.tenantId },
        }),
      );
    });
  });

  describe('listAll', () => {
    it('should return a Map of projectId to tenantId', async () => {
      const mockRows = [
        { projectId: 'proj-1', tenantId: 'tenant-a' },
        { projectId: 'proj-2', tenantId: 'tenant-b' },
      ];
      db.from.mockResolvedValue(mockRows);

      const result = await repo.listAll();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('proj-1')).toBe('tenant-a');
      expect(result.get('proj-2')).toBe('tenant-b');
    });

    it('should return an empty Map when no relations exist', async () => {
      db.from.mockResolvedValue([]);

      const result = await repo.listAll();

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });
});
