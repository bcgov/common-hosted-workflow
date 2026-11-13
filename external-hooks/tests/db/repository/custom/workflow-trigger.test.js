"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const workflow_trigger_1 = require("../../../../src/db/repository/custom/workflow-trigger");
const mocks_1 = require("../../../helpers/mocks");
(0, vitest_1.describe)('WorkflowTriggerRepository', () => {
    let db;
    let repo;
    (0, vitest_1.beforeEach)(() => {
        db = {
            select: vitest_1.vi.fn().mockReturnThis(),
            insert: vitest_1.vi.fn().mockReturnThis(),
            update: vitest_1.vi.fn().mockReturnThis(),
            delete: vitest_1.vi.fn().mockReturnThis(),
            from: vitest_1.vi.fn().mockReturnThis(),
            where: vitest_1.vi.fn().mockReturnThis(),
            orderBy: vitest_1.vi.fn().mockReturnThis(),
            limit: vitest_1.vi.fn().mockReturnThis(),
            set: vitest_1.vi.fn().mockReturnThis(),
            values: vitest_1.vi.fn().mockReturnThis(),
            returning: vitest_1.vi.fn().mockResolvedValue([]),
        };
        repo = new workflow_trigger_1.WorkflowTriggerRepository(db);
    });
    (0, vitest_1.describe)('list', () => {
        (0, vitest_1.it)('should return trigger rows matching the given where clauses', async () => {
            const mockRows = [(0, mocks_1.makeWorkflowTriggerRow)(), (0, mocks_1.makeWorkflowTriggerRow)({ id: 'trigger-002' })];
            db.limit.mockResolvedValue(mockRows);
            const result = await repo.list({ where: [], limit: 10 });
            (0, vitest_1.expect)(db.select).toHaveBeenCalled();
            (0, vitest_1.expect)(db.from).toHaveBeenCalled();
            (0, vitest_1.expect)(db.orderBy).toHaveBeenCalled();
            (0, vitest_1.expect)(db.limit).toHaveBeenCalledWith(10);
            (0, vitest_1.expect)(result).toHaveLength(2);
        });
        (0, vitest_1.it)('should return an empty array when no triggers match', async () => {
            db.limit.mockResolvedValue([]);
            const result = await repo.list({ where: [], limit: 100 });
            (0, vitest_1.expect)(result).toEqual([]);
        });
    });
    (0, vitest_1.describe)('getById', () => {
        (0, vitest_1.it)('should return a trigger when found', async () => {
            const mockRow = (0, mocks_1.makeWorkflowTriggerRow)();
            db.limit.mockResolvedValue([mockRow]);
            const result = await repo.getById({ triggerId: mocks_1.VALID_TRIGGER_ID });
            (0, vitest_1.expect)(db.select).toHaveBeenCalled();
            (0, vitest_1.expect)(db.where).toHaveBeenCalled();
            (0, vitest_1.expect)(result).toEqual(mockRow);
        });
        (0, vitest_1.it)('should return null when trigger is not found', async () => {
            db.limit.mockResolvedValue([]);
            const result = await repo.getById({ triggerId: 'nonexistent' });
            (0, vitest_1.expect)(result).toBeNull();
        });
        (0, vitest_1.it)('should apply additional where clauses when provided', async () => {
            const mockRow = (0, mocks_1.makeWorkflowTriggerRow)();
            db.limit.mockResolvedValue([mockRow]);
            const result = await repo.getById({ triggerId: mocks_1.VALID_TRIGGER_ID, where: ['some-clause'] });
            (0, vitest_1.expect)(result).toEqual(mockRow);
            (0, vitest_1.expect)(db.where).toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)('create', () => {
        (0, vitest_1.it)('should insert a new trigger and return the created row', async () => {
            const mockRow = (0, mocks_1.makeWorkflowTriggerRow)();
            db.returning.mockResolvedValue([mockRow]);
            const input = {
                projectId: mocks_1.VALID_PROJECT_ID,
                triggerType: 'button',
                targetKind: 'n8n-node',
                targetWorkflowId: 'wf1',
                targetNodeId: 'node1',
                metadata: { buttonText: 'Run' },
                allowedActorsType: 'user',
                allowedActors: ['actor@example.com'],
                authEnabled: false,
                createdBy: 'creator@example.com',
            };
            const result = await repo.create(input);
            (0, vitest_1.expect)(db.insert).toHaveBeenCalled();
            (0, vitest_1.expect)(db.values).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                projectId: mocks_1.VALID_PROJECT_ID,
                triggerType: 'button',
                authEnabled: false,
            }));
            (0, vitest_1.expect)(result).toEqual(mockRow);
        });
        (0, vitest_1.it)('should default authEnabled to false when omitted', async () => {
            const mockRow = (0, mocks_1.makeWorkflowTriggerRow)({ authEnabled: false });
            db.returning.mockResolvedValue([mockRow]);
            await repo.create({
                projectId: mocks_1.VALID_PROJECT_ID,
                triggerType: 'button',
                targetKind: 'n8n-node',
                targetWorkflowId: 'wf1',
                targetNodeId: 'node1',
                metadata: {},
                allowedActorsType: 'user',
                allowedActors: [],
            });
            (0, vitest_1.expect)(db.values).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ authEnabled: false }));
        });
    });
    (0, vitest_1.describe)('update', () => {
        (0, vitest_1.it)('should update mutable fields and return the updated row', async () => {
            const updatedRow = (0, mocks_1.makeWorkflowTriggerRow)({ targetNodeId: 'node2' });
            db.returning.mockResolvedValue([updatedRow]);
            const params = {
                triggerId: mocks_1.VALID_TRIGGER_ID,
                targetKind: 'n8n-node',
                targetWorkflowId: 'wf2',
                targetNodeId: 'node2',
                metadata: { buttonText: 'Submit' },
                allowedActorsType: 'role',
                allowedActors: ['editor'],
                authEnabled: true,
                updatedBy: 'admin@example.com',
            };
            const result = await repo.update(params);
            (0, vitest_1.expect)(db.update).toHaveBeenCalled();
            (0, vitest_1.expect)(db.set).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                targetKind: 'n8n-node',
                targetWorkflowId: 'wf2',
                targetNodeId: 'node2',
                authEnabled: true,
                updatedBy: 'admin@example.com',
            }));
            (0, vitest_1.expect)(result).toEqual(updatedRow);
        });
        (0, vitest_1.it)('should return null when the trigger is not found', async () => {
            db.returning.mockResolvedValue([]);
            const result = await repo.update({
                triggerId: 'nonexistent',
                targetKind: 'n8n-node',
                targetWorkflowId: 'wf1',
                targetNodeId: 'node1',
                metadata: {},
                allowedActorsType: 'user',
                allowedActors: [],
                authEnabled: false,
                updatedBy: 'admin@example.com',
            });
            (0, vitest_1.expect)(result).toBeNull();
        });
    });
    (0, vitest_1.describe)('deleteById', () => {
        (0, vitest_1.it)('should delete and return the deleted trigger row', async () => {
            const deletedRow = (0, mocks_1.makeWorkflowTriggerRow)();
            db.returning.mockResolvedValue([deletedRow]);
            const result = await repo.deleteById({ triggerId: mocks_1.VALID_TRIGGER_ID });
            (0, vitest_1.expect)(db.delete).toHaveBeenCalled();
            (0, vitest_1.expect)(db.where).toHaveBeenCalled();
            (0, vitest_1.expect)(result).toEqual(deletedRow);
        });
        (0, vitest_1.it)('should return null when trigger does not exist', async () => {
            db.returning.mockResolvedValue([]);
            const result = await repo.deleteById({ triggerId: 'nonexistent' });
            (0, vitest_1.expect)(result).toBeNull();
        });
    });
    (0, vitest_1.describe)('listIdsByProjectIds', () => {
        (0, vitest_1.it)('should return trigger IDs for the given project IDs', async () => {
            const mockRows = [{ id: 'trigger-001' }, { id: 'trigger-002' }];
            db.where.mockResolvedValue(mockRows);
            const result = await repo.listIdsByProjectIds([mocks_1.VALID_PROJECT_ID]);
            (0, vitest_1.expect)(db.select).toHaveBeenCalled();
            (0, vitest_1.expect)(result).toEqual(['trigger-001', 'trigger-002']);
        });
        (0, vitest_1.it)('should return an empty array when no triggers exist for the projects', async () => {
            db.where.mockResolvedValue([]);
            const result = await repo.listIdsByProjectIds(['unknown-project']);
            (0, vitest_1.expect)(result).toEqual([]);
        });
    });
});
