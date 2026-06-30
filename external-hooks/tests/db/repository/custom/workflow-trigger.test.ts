import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowTriggerRepository } from '../../../../src/db/repository/custom/workflow-trigger';
import { makeWorkflowTriggerRow, VALID_PROJECT_ID, VALID_TRIGGER_ID } from '../../../helpers/mocks';

describe('WorkflowTriggerRepository', () => {
  let db: any;
  let repo: WorkflowTriggerRepository;

  beforeEach(() => {
    db = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    repo = new WorkflowTriggerRepository(db);
  });

  describe('list', () => {
    it('should return trigger rows matching the given where clauses', async () => {
      const mockRows = [makeWorkflowTriggerRow(), makeWorkflowTriggerRow({ id: 'trigger-002' })];
      db.limit.mockResolvedValue(mockRows);

      const result = await repo.list({ where: [], limit: 10 });

      expect(db.select).toHaveBeenCalled();
      expect(db.from).toHaveBeenCalled();
      expect(db.orderBy).toHaveBeenCalled();
      expect(db.limit).toHaveBeenCalledWith(10);
      expect(result).toHaveLength(2);
    });

    it('should return an empty array when no triggers match', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.list({ where: [], limit: 100 });

      expect(result).toEqual([]);
    });
  });

  describe('getById', () => {
    it('should return a trigger when found', async () => {
      const mockRow = makeWorkflowTriggerRow();
      db.limit.mockResolvedValue([mockRow]);

      const result = await repo.getById({ triggerId: VALID_TRIGGER_ID });

      expect(db.select).toHaveBeenCalled();
      expect(db.where).toHaveBeenCalled();
      expect(result).toEqual(mockRow);
    });

    it('should return null when trigger is not found', async () => {
      db.limit.mockResolvedValue([]);

      const result = await repo.getById({ triggerId: 'nonexistent' });

      expect(result).toBeNull();
    });

    it('should apply additional where clauses when provided', async () => {
      const mockRow = makeWorkflowTriggerRow();
      db.limit.mockResolvedValue([mockRow]);

      const result = await repo.getById({ triggerId: VALID_TRIGGER_ID, where: ['some-clause'] as any });

      expect(result).toEqual(mockRow);
      expect(db.where).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should insert a new trigger and return the created row', async () => {
      const mockRow = makeWorkflowTriggerRow();
      db.returning.mockResolvedValue([mockRow]);

      const input = {
        projectId: VALID_PROJECT_ID,
        triggerType: 'button',
        triggerUrl: 'https://example.com/webhook',
        triggerMethod: 'POST',
        metadata: { buttonText: 'Run' },
        allowedActorsType: 'user',
        allowedActors: ['actor@example.com'],
        authEnabled: false,
        createdBy: 'creator@example.com',
      };

      const result = await repo.create(input);

      expect(db.insert).toHaveBeenCalled();
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: VALID_PROJECT_ID,
          triggerType: 'button',
          authEnabled: false,
        }),
      );
      expect(result).toEqual(mockRow);
    });

    it('should default authEnabled to false when omitted', async () => {
      const mockRow = makeWorkflowTriggerRow({ authEnabled: false });
      db.returning.mockResolvedValue([mockRow]);

      await repo.create({
        projectId: VALID_PROJECT_ID,
        triggerType: 'button',
        triggerUrl: 'https://example.com/hook',
        triggerMethod: 'POST',
        metadata: {},
        allowedActorsType: 'user',
        allowedActors: [],
      });

      expect(db.values).toHaveBeenCalledWith(expect.objectContaining({ authEnabled: false }));
    });
  });

  describe('update', () => {
    it('should update mutable fields and return the updated row', async () => {
      const updatedRow = makeWorkflowTriggerRow({ triggerUrl: 'https://new.example.com/hook' });
      db.returning.mockResolvedValue([updatedRow]);

      const params = {
        triggerId: VALID_TRIGGER_ID,
        triggerUrl: 'https://new.example.com/hook',
        triggerMethod: 'GET',
        metadata: { buttonText: 'Submit' },
        allowedActorsType: 'role',
        allowedActors: ['editor'],
        authEnabled: true,
        updatedBy: 'admin@example.com',
      };

      const result = await repo.update(params);

      expect(db.update).toHaveBeenCalled();
      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerUrl: 'https://new.example.com/hook',
          triggerMethod: 'GET',
          authEnabled: true,
          updatedBy: 'admin@example.com',
        }),
      );
      expect(result).toEqual(updatedRow);
    });

    it('should return null when the trigger is not found', async () => {
      db.returning.mockResolvedValue([]);

      const result = await repo.update({
        triggerId: 'nonexistent',
        triggerUrl: 'https://example.com',
        triggerMethod: 'POST',
        metadata: {},
        allowedActorsType: 'user',
        allowedActors: [],
        authEnabled: false,
        updatedBy: 'admin@example.com',
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteById', () => {
    it('should delete and return the deleted trigger row', async () => {
      const deletedRow = makeWorkflowTriggerRow();
      db.returning.mockResolvedValue([deletedRow]);

      const result = await repo.deleteById({ triggerId: VALID_TRIGGER_ID });

      expect(db.delete).toHaveBeenCalled();
      expect(db.where).toHaveBeenCalled();
      expect(result).toEqual(deletedRow);
    });

    it('should return null when trigger does not exist', async () => {
      db.returning.mockResolvedValue([]);

      const result = await repo.deleteById({ triggerId: 'nonexistent' });

      expect(result).toBeNull();
    });
  });

  describe('listIdsByProjectIds', () => {
    it('should return trigger IDs for the given project IDs', async () => {
      const mockRows = [{ id: 'trigger-001' }, { id: 'trigger-002' }];
      db.where.mockResolvedValue(mockRows);

      const result = await repo.listIdsByProjectIds([VALID_PROJECT_ID]);

      expect(db.select).toHaveBeenCalled();
      expect(result).toEqual(['trigger-001', 'trigger-002']);
    });

    it('should return an empty array when no triggers exist for the projects', async () => {
      db.where.mockResolvedValue([]);

      const result = await repo.listIdsByProjectIds(['unknown-project']);

      expect(result).toEqual([]);
    });
  });
});
