"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Unit tests for the action-request route handlers in
 * `src/api/routes/actions.ts`.
 *
 * Same strategy as message.test.ts: instantiate the router, extract
 * handlers from the Express stack, and run them with mock objects.
 */
const vitest_1 = require("vitest");
const actions_1 = require("../../../src/api/routes/actions");
const mocks_1 = require("../../helpers/mocks");
const test_utils_1 = require("../../helpers/test-utils");
/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */
function createTestRouter() {
    const actionRequestRepo = (0, mocks_1.createMockActionRequestRepository)();
    const messageRepo = (0, mocks_1.createMockMessageRepository)();
    const n8nRepos = (0, mocks_1.createMockN8nRepositories)();
    const routeContext = (0, mocks_1.createMockRouteContext)({
        n8nRepositories: { raw: n8nRepos },
        customRepositories: {
            tenantProjectRelation: {},
            message: messageRepo,
            actionRequest: actionRequestRepo,
        },
        services: {
            uiApi: {},
            action: (0, mocks_1.createMockActionService)(actionRequestRepo, n8nRepos),
            message: (0, mocks_1.createMockMessageService)(messageRepo, n8nRepos),
            accessRequest: {},
            chefs: {},
            cstar: {},
            featureFlag: {},
            tenant: {},
            tenantProjectSync: {},
            projectTenant: {},
            claim: {},
            trigger: {},
            multiWebhookWait: {},
            triggerTarget: {},
            workflowRunner: {},
        },
    });
    const router = (0, actions_1.buildActionRouter)(routeContext);
    return { router, actionRequestRepo, n8nRepos };
}
/* ================================================================== */
/*  POST /actions                                                      */
/* ================================================================== */
(0, vitest_1.describe)('POST /actions', () => {
    const validBody = {
        actionType: 'approval',
        payload: { key: 'value' },
        callbackUrl: 'https://example.com/cb',
        actorId: mocks_1.VALID_ACTOR_ID,
        actorType: 'user',
        workflowInstanceId: mocks_1.VALID_EXECUTION_ID,
        workflowId: mocks_1.VALID_WORKFLOW_ID,
    };
    (0, vitest_1.it)('returns 201 with created action on valid input', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.create.mockResolvedValue((0, mocks_1.makeActionRequestRow)());
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/actions');
        const req = (0, mocks_1.createMockRequest)({ params: {}, query: {}, body: validBody });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(201);
        (0, vitest_1.expect)(res.json).toHaveBeenCalled();
    });
    (0, vitest_1.it)('defaults status to "pending", priority to "normal", callbackMethod to "POST"', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.create.mockResolvedValue((0, mocks_1.makeActionRequestRow)());
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/actions');
        const req = (0, mocks_1.createMockRequest)({ params: {}, query: {}, body: validBody });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(actionRequestRepo.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ status: 'pending', priority: 'normal', callbackMethod: 'POST' }));
    });
    (0, vitest_1.it)('passes dueDate and checkIn as null when not provided', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.create.mockResolvedValue((0, mocks_1.makeActionRequestRow)());
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/actions');
        const req = (0, mocks_1.createMockRequest)({ params: {}, query: {}, body: validBody });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(actionRequestRepo.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ dueDate: null, checkIn: null }));
    });
    (0, vitest_1.it)('returns validation error for missing required fields', async () => {
        const { router } = createTestRouter();
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/actions');
        const req = (0, mocks_1.createMockRequest)({ params: {}, query: {}, body: {} });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeDefined();
        (0, vitest_1.expect)(error.statusCode).toBe(400);
    });
    (0, vitest_1.it)('throws 500 when DB insert fails', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.create.mockRejectedValue(new Error('DB error'));
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/actions');
        const req = (0, mocks_1.createMockRequest)({ params: {}, query: {}, body: validBody });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeDefined();
        (0, vitest_1.expect)(error.statusCode).toBe(500);
    });
});
/* ================================================================== */
/*  GET /actions                                                       */
/* ================================================================== */
(0, vitest_1.describe)('GET /actions', () => {
    (0, vitest_1.it)('returns 200 with items and nextCursor', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.list.mockResolvedValue([(0, mocks_1.makeActionRequestRow)()]);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
        const req = (0, mocks_1.createMockRequest)({ params: {}, query: {} });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        (0, vitest_1.expect)(payload).toHaveProperty('items');
        (0, vitest_1.expect)(payload).toHaveProperty('nextCursor');
    });
    (0, vitest_1.it)('filters by actorId when provided', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.list.mockResolvedValue([]);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
        const req = (0, mocks_1.createMockRequest)({ params: {}, query: { actorId: 'specific-actor' } });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(actionRequestRepo.list).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ limit: 50 }));
        const callArg = actionRequestRepo.list.mock.calls[0][0];
        (0, vitest_1.expect)(callArg.where).toBeInstanceOf(Array);
        (0, vitest_1.expect)(callArg.where.length).toBeGreaterThanOrEqual(2);
    });
    (0, vitest_1.it)('uses default limit of 50', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.list.mockResolvedValue([]);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
        const req = (0, mocks_1.createMockRequest)({ params: {}, query: {} });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(actionRequestRepo.list).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ limit: 50 }));
    });
    (0, vitest_1.it)('validates execution in tenant scope when workflowInstanceId provided', async () => {
        const { router, n8nRepos } = createTestRouter();
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
        const req = (0, mocks_1.createMockRequest)({ params: {}, query: { workflowInstanceId: mocks_1.VALID_EXECUTION_ID } });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(n8nRepos.execution.loadMetadataOrNull).toHaveBeenCalled();
    });
});
/* ================================================================== */
/*  GET /actions/:actionId                                             */
/* ================================================================== */
(0, vitest_1.describe)('GET /actions/:actionId', () => {
    (0, vitest_1.it)('returns 200 with single action', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.getById.mockResolvedValue((0, mocks_1.makeActionRequestRow)());
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions/:actionId');
        const req = (0, mocks_1.createMockRequest)({ params: { actionId: mocks_1.VALID_ACTION_ID }, query: {} });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    });
    (0, vitest_1.it)('throws 404 when action not found', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.getById.mockResolvedValue(null);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions/:actionId');
        const req = (0, mocks_1.createMockRequest)({ params: { actionId: 'missing' }, query: {} });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeDefined();
        (0, vitest_1.expect)(error.statusCode).toBe(404);
    });
});
/* ================================================================== */
/*  PATCH /actions/:actionId                                           */
/* ================================================================== */
(0, vitest_1.describe)('PATCH /actions/:actionId', () => {
    (0, vitest_1.it)('returns 200 with updated status', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.directUpdate.mockResolvedValue((0, mocks_1.makeActionRequestRow)({ status: 'completed' }));
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'patch', '/actions/:actionId');
        const req = (0, mocks_1.createMockRequest)({ params: { actionId: mocks_1.VALID_ACTION_ID }, query: {}, body: { status: 'completed' } });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        (0, vitest_1.expect)(payload.status).toBe('completed');
        (0, vitest_1.expect)(payload.id).toBe(mocks_1.VALID_ACTION_ID);
    });
    (0, vitest_1.it)('throws 404 when action not found', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.directUpdate.mockResolvedValue(null);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'patch', '/actions/:actionId');
        const req = (0, mocks_1.createMockRequest)({ params: { actionId: 'missing' }, query: {}, body: { status: 'completed' } });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeDefined();
        (0, vitest_1.expect)(error.statusCode).toBe(404);
    });
    (0, vitest_1.it)('returns full action response with "deleted" status', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.directUpdate.mockResolvedValue((0, mocks_1.makeActionRequestRow)({ status: 'deleted' }));
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'patch', '/actions/:actionId');
        const req = (0, mocks_1.createMockRequest)({ params: { actionId: mocks_1.VALID_ACTION_ID }, query: {}, body: { status: 'deleted' } });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        const payload = res.json.mock.calls[0][0];
        (0, vitest_1.expect)(payload.status).toBe('deleted');
        (0, vitest_1.expect)(payload.id).toBe(mocks_1.VALID_ACTION_ID);
    });
    (0, vitest_1.it)('returns validation error for invalid status', async () => {
        const { router } = createTestRouter();
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'patch', '/actions/:actionId');
        const req = (0, mocks_1.createMockRequest)({ params: { actionId: mocks_1.VALID_ACTION_ID }, query: {}, body: { status: 'invalid' } });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeDefined();
        (0, vitest_1.expect)(error.statusCode).toBe(400);
    });
});
