"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const trigger_service_1 = require("../../../src/api/services/trigger.service");
const errors_1 = require("../../../src/api/utils/errors");
const mocks_1 = require("../../helpers/mocks");
const live = {
    ok: true,
    target: { inputSchema: [{ name: 'amount', type: 'number' }] },
    published: {},
};
function setup(resolve = live) {
    const create = vitest_1.vi.fn().mockImplementation(async (input) => (0, mocks_1.makeWorkflowTriggerRow)(input));
    const update = vitest_1.vi.fn().mockImplementation(async (input) => (0, mocks_1.makeWorkflowTriggerRow)(input));
    const getById = vitest_1.vi.fn().mockResolvedValue((0, mocks_1.makeWorkflowTriggerRow)());
    const targets = { resolve: vitest_1.vi.fn().mockResolvedValue(resolve) };
    const service = new trigger_service_1.TriggerService({ workflowTrigger: { create, update, getById } }, { applyCredentialToTriggerMetadata: vitest_1.vi.fn() }, targets);
    return { service, create, update, targets };
}
const base = {
    projectId: 'proj-1',
    allowedProjectIds: ['proj-1', 'proj-2'],
    triggerType: 'button',
    targetKind: 'n8n-node',
    targetWorkflowId: 'wf1',
    targetNodeId: 'node1',
    metadata: { buttonText: 'Go', inputValues: { amount: 5 } },
    allowedActorsType: 'all',
    allowedActors: ['*'],
    n8nUser: null,
};
(0, vitest_1.describe)('TriggerService n8n-node targets', () => {
    (0, vitest_1.it)('validates against the tenant projects and stores only workflow + node ids', async () => {
        const { service, create, targets } = setup();
        await service.create(base);
        (0, vitest_1.expect)(targets.resolve).toHaveBeenCalledWith({
            workflowId: 'wf1',
            nodeId: 'node1',
            projectIds: ['proj-1', 'proj-2'],
            source: 'button',
        });
        (0, vitest_1.expect)(create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            targetKind: 'n8n-node',
            targetWorkflowId: 'wf1',
            targetNodeId: 'node1',
        }));
    });
    (0, vitest_1.it)('rejects an unavailable target with 422 and the reason', async () => {
        const { service, create } = setup({ ok: false, reason: 'missing-node' });
        const error = await service.create(base).catch((e) => e);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error).toMatchObject({ statusCode: 422, details: { reason: 'missing-node' } });
        (0, vitest_1.expect)(create).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects button input values of the wrong type with 422', async () => {
        const { service } = setup();
        const error = await service
            .create({ ...base, metadata: { buttonText: 'Go', inputValues: { amount: 'lots' } } })
            .catch((e) => e);
        (0, vitest_1.expect)(error).toMatchObject({ statusCode: 422, details: { errors: ['"amount" must be of type number'] } });
    });
    (0, vitest_1.it)('requires the target ids', async () => {
        const { service } = setup();
        const error = await service.create({ ...base, targetNodeId: undefined }).catch((e) => e);
        (0, vitest_1.expect)(error).toMatchObject({ statusCode: 422 });
    });
    (0, vitest_1.it)('rejects creation with 400 when no target service is available', async () => {
        const create = vitest_1.vi.fn().mockImplementation(async (input) => (0, mocks_1.makeWorkflowTriggerRow)(input));
        const service = new trigger_service_1.TriggerService({ workflowTrigger: { create } }, {});
        const error = await service.create(base).catch((e) => e);
        (0, vitest_1.expect)(error).toMatchObject({ statusCode: 400 });
        (0, vitest_1.expect)(create).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('re-validates on update against the existing trigger type', async () => {
        const { service, update, targets } = setup();
        await service.update({
            triggerId: 'trigger-001',
            projectIds: ['proj-1'],
            targetKind: 'n8n-node',
            targetWorkflowId: 'wf2',
            targetNodeId: 'node2',
            metadata: { buttonText: 'Go' },
            allowedActorsType: 'all',
            allowedActors: ['*'],
            authEnabled: false,
            updatedBy: 'u',
            n8nUser: null,
        });
        (0, vitest_1.expect)(targets.resolve).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ workflowId: 'wf2', source: 'button' }));
        (0, vitest_1.expect)(update).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ targetWorkflowId: 'wf2', targetNodeId: 'node2' }));
    });
});
