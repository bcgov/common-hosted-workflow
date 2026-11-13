"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Route tests for n8n-node triggers in `src/api/routes/triggers.ts`:
 * `POST /triggers/:triggerId/callback` (node branch) and `GET /trigger-targets`.
 */
const vitest_1 = require("vitest");
const { resolveWilTenantProjectIdsMock } = vitest_1.vi.hoisted(() => ({ resolveWilTenantProjectIdsMock: vitest_1.vi.fn() }));
vitest_1.vi.mock('../../../src/api/routes/helpers/wil-tenant', () => ({
    resolveWilTenantProjectIds: resolveWilTenantProjectIdsMock,
    extractTenantId: vitest_1.vi.fn(),
}));
const triggers_1 = require("../../../src/api/routes/triggers");
const mocks_1 = require("../../helpers/mocks");
const test_utils_1 = require("../../helpers/test-utils");
const errors_1 = require("../../../src/api/utils/errors");
const TENANT_ID = 'tenant-1';
const PROJECT_IDS = ['proj-1'];
const nodeTrigger = (overrides = {}) => (0, mocks_1.makeWorkflowTriggerRow)({
    targetKind: 'n8n-node',
    targetWorkflowId: 'wf1',
    targetNodeId: 'node1',
    triggerUrl: null,
    triggerMethod: null,
    allowedActorsType: 'all',
    allowedActors: ['*'],
    metadata: { buttonText: 'Go', inputValues: { amount: 5 } },
    ...overrides,
});
const target = (overrides = {}) => ({
    workflowId: 'wf1',
    workflowName: 'Flow',
    projectId: 'proj-1',
    nodeId: 'node1',
    nodeName: 'WIL Trigger',
    label: 'Go',
    description: '',
    acceptedSources: ['button'],
    inputSource: 'passthrough',
    inputSchema: [],
    respondMode: 'immediately',
    responseTimeoutSec: 30,
    ...overrides,
});
function setup(opts = {}) {
    const services = {
        trigger: { getById: vitest_1.vi.fn().mockResolvedValue(opts.trigger ?? nodeTrigger()), list: vitest_1.vi.fn().mockResolvedValue([]) },
        triggerTarget: {
            resolve: vitest_1.vi
                .fn()
                .mockResolvedValue(opts.resolve ?? { ok: true, target: target(), published: { workflow: {}, projectId: 'proj-1' } }),
            list: vitest_1.vi.fn().mockResolvedValue([target()]),
            statuses: vitest_1.vi.fn().mockResolvedValue(new Map()),
        },
        workflowRunner: {
            start: vitest_1.vi.fn().mockResolvedValue(opts.start ?? { executionId: 'exec-1', status: 'dispatched' }),
        },
    };
    const customRepositories = {
        tenantProjectRelation: {
            getRowByTenantId: vitest_1.vi.fn().mockResolvedValue({ projectType: 'team', projectId: 'proj-1' }),
        },
    };
    const router = (0, triggers_1.buildTriggerRouter)({ services, customRepositories, n8nRepositories: {} });
    const session = {
        email: 'actor@example.com',
        n8nUser: null,
        tenantRoles: [{ tenantId: TENANT_ID, roles: opts.manager ? ['project:editor'] : ['viewer'] }],
        tenantGroups: [],
    };
    return { router, services, session };
}
async function callback(ctx) {
    const handlers = (0, test_utils_1.getRouteHandlers)(ctx.router, 'post', '/triggers/:triggerId/callback');
    const req = (0, mocks_1.createMockRequest)({ params: { triggerId: 'trigger-001' }, body: {}, session: ctx.session });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    return { error, res };
}
(0, vitest_1.beforeEach)(() => {
    resolveWilTenantProjectIdsMock.mockReset();
    resolveWilTenantProjectIdsMock.mockResolvedValue({ tenantId: TENANT_ID, projectIds: PROJECT_IDS });
});
(0, vitest_1.describe)('POST /triggers/:triggerId/callback (n8n-node target)', () => {
    (0, vitest_1.it)('starts the node with the WIL item and answers 202 with the execution id', async () => {
        const ctx = setup();
        const { error, res } = await callback(ctx);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(202);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ success: true, executionId: 'exec-1' });
        const call = ctx.services.workflowRunner.start.mock.calls[0][0];
        (0, vitest_1.expect)(call.startNodeId).toBe('node1');
        (0, vitest_1.expect)(call.wait).toBeUndefined();
        (0, vitest_1.expect)(call.items[0].json).toMatchObject({
            source: 'wil',
            trigger: { id: 'trigger-001', type: 'button', name: 'Go' },
            actor: { email: 'actor@example.com', tenantId: TENANT_ID, roles: ['viewer'] },
            input: { amount: 5 },
        });
        (0, vitest_1.expect)(ctx.services.triggerTarget.resolve).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ workflowId: 'wf1', nodeId: 'node1', projectIds: PROJECT_IDS, source: 'button' }));
    });
    (0, vitest_1.it)('waits for the last node and returns its result with 200', async () => {
        const ctx = setup({
            resolve: { ok: true, target: target({ respondMode: 'lastNode', responseTimeoutSec: 7 }), published: {} },
            start: { executionId: 'exec-2', status: 'succeeded', result: { approved: true } },
        });
        const { res } = await callback(ctx);
        (0, vitest_1.expect)(ctx.services.workflowRunner.start.mock.calls[0][0].wait).toEqual({ timeoutMs: 7000 });
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ success: true, executionId: 'exec-2', result: { approved: true } });
    });
    (0, vitest_1.it)('answers 202 when a lastNode run is still going after the timeout', async () => {
        const ctx = setup({
            resolve: { ok: true, target: target({ respondMode: 'lastNode' }), published: {} },
            start: { executionId: 'exec-3', status: 'dispatched' },
        });
        const { res } = await callback(ctx);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(202);
    });
    (0, vitest_1.it)('answers 502 when the run fails', async () => {
        const ctx = setup({ start: { executionId: 'exec-4', status: 'failed' } });
        const { res } = await callback(ctx);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(502);
        (0, vitest_1.expect)(res.json.mock.calls[0][0].error).toMatchObject({ executionId: 'exec-4' });
    });
    (0, vitest_1.it)('fails with 409 and does not run when the target is no longer live', async () => {
        const ctx = setup({ resolve: { ok: false, reason: 'unpublished' } });
        const { error } = await callback(ctx);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(409);
        (0, vitest_1.expect)(error.details).toMatchObject({ code: 'WIL_TARGET_UNAVAILABLE', reason: 'unpublished' });
        (0, vitest_1.expect)(ctx.services.workflowRunner.start).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects an actor who is not allowed (403) without touching n8n', async () => {
        const ctx = setup({ trigger: nodeTrigger({ allowedActorsType: 'user', allowedActors: ['someone@else.com'] }) });
        const { res } = await callback(ctx);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(403);
        (0, vitest_1.expect)(ctx.services.triggerTarget.resolve).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('never calls the webhook path for node targets', async () => {
        const fetchSpy = vitest_1.vi.spyOn(globalThis, 'fetch');
        await callback(setup());
        (0, vitest_1.expect)(fetchSpy).not.toHaveBeenCalled();
        fetchSpy.mockRestore();
    });
});
(0, vitest_1.describe)('GET /trigger-targets', () => {
    async function list(ctx, query = { source: 'button' }) {
        const handlers = (0, test_utils_1.getRouteHandlers)(ctx.router, 'get', '/trigger-targets');
        const req = (0, mocks_1.createMockRequest)({ query, session: ctx.session });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        return { error, res };
    }
    (0, vitest_1.it)('lists targets for managers, filtered by source', async () => {
        const ctx = setup({ manager: true });
        const { res } = await list(ctx);
        (0, vitest_1.expect)(ctx.services.triggerTarget.list).toHaveBeenCalledWith({ projectIds: PROJECT_IDS, source: 'button' });
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(res.json.mock.calls[0][0]).toMatchObject({ enabled: true, data: [{ workflowId: 'wf1', nodeId: 'node1' }] });
    });
    (0, vitest_1.it)('is manager-only', async () => {
        const ctx = setup({ manager: false });
        const { res } = await list(ctx);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(403);
        (0, vitest_1.expect)(ctx.services.triggerTarget.list).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects an unknown source', async () => {
        const { error } = await list(setup({ manager: true }), { source: 'bogus' });
        (0, vitest_1.expect)(error).toBeTruthy();
    });
});
