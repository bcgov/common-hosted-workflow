"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Unit tests for the actor-prefixed route handlers in
 * `src/api/routes/actors.ts`.
 */
const vitest_1 = require("vitest");
const actors_1 = require("../../../src/api/routes/actors");
const mocks_1 = require("../../helpers/mocks");
const test_utils_1 = require("../../helpers/test-utils");
/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */
function createTestRouter() {
    const messageRepo = (0, mocks_1.createMockMessageRepository)();
    const actionRequestRepo = (0, mocks_1.createMockActionRequestRepository)();
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
    const router = (0, actors_1.buildActorRouter)(routeContext);
    return { router, messageRepo, actionRequestRepo, n8nRepos };
}
/* ================================================================== */
/*  GET /actors/:actorId/messages                                      */
/* ================================================================== */
(0, vitest_1.describe)('GET /actors/:actorId/messages', () => {
    (0, vitest_1.it)('returns 200 with messages for a valid request', async () => {
        const { router, messageRepo } = createTestRouter();
        messageRepo.list.mockResolvedValue([(0, mocks_1.makeMessageRow)(), (0, mocks_1.makeMessageRow)({ id: 'msg-002' })]);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actors/:actorId/messages');
        (0, vitest_1.expect)(handlers).not.toBeNull();
        const req = (0, mocks_1.createMockRequest)({ params: { actorId: mocks_1.VALID_ACTOR_ID }, query: {} });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(res.json).toHaveBeenCalled();
        (0, vitest_1.expect)(res.json.mock.calls[0][0]).toHaveLength(2);
    });
    (0, vitest_1.it)('passes workflowInstanceId filter to repository', async () => {
        const { router, messageRepo, n8nRepos } = createTestRouter();
        messageRepo.list.mockResolvedValue([]);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actors/:actorId/messages');
        const req = (0, mocks_1.createMockRequest)({
            params: { actorId: mocks_1.VALID_ACTOR_ID },
            query: { workflowInstanceId: mocks_1.VALID_EXECUTION_ID },
        });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(n8nRepos.execution.loadMetadataOrNull).toHaveBeenCalled();
        (0, vitest_1.expect)(messageRepo.list).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ limit: 50 }));
        const callArg = messageRepo.list.mock.calls[0][0];
        (0, vitest_1.expect)(callArg.where).toBeInstanceOf(Array);
        (0, vitest_1.expect)(callArg.where.length).toBeGreaterThanOrEqual(3);
    });
    (0, vitest_1.it)('uses default limit of 50 when not specified', async () => {
        const { router, messageRepo } = createTestRouter();
        messageRepo.list.mockResolvedValue([]);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actors/:actorId/messages');
        const req = (0, mocks_1.createMockRequest)({ params: { actorId: mocks_1.VALID_ACTOR_ID }, query: {} });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(messageRepo.list).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ limit: 50 }));
    });
    (0, vitest_1.it)('returns validation error for empty actorId', async () => {
        const { router } = createTestRouter();
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actors/:actorId/messages');
        const req = (0, mocks_1.createMockRequest)({ params: { actorId: '' }, query: {} });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeDefined();
        (0, vitest_1.expect)(error.statusCode).toBe(400);
    });
});
/* ================================================================== */
/*  GET /actors/:actorId/actions/:actionId                             */
/* ================================================================== */
(0, vitest_1.describe)('GET /actors/:actorId/actions/:actionId', () => {
    (0, vitest_1.it)('returns 200 scoped to actor', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.getById.mockResolvedValue((0, mocks_1.makeActionRequestRow)());
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actors/:actorId/actions/:actionId');
        const req = (0, mocks_1.createMockRequest)({ params: { actorId: mocks_1.VALID_ACTOR_ID, actionId: mocks_1.VALID_ACTION_ID }, query: {} });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(actionRequestRepo.getById).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ actionId: mocks_1.VALID_ACTION_ID }));
        const callArg = actionRequestRepo.getById.mock.calls[0][0];
        (0, vitest_1.expect)(callArg.where).toBeInstanceOf(Array);
        (0, vitest_1.expect)(callArg.where.length).toBeGreaterThanOrEqual(2);
    });
    (0, vitest_1.it)('throws 404 when not found for that actor', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.getById.mockResolvedValue(null);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actors/:actorId/actions/:actionId');
        const req = (0, mocks_1.createMockRequest)({ params: { actorId: 'other-actor', actionId: mocks_1.VALID_ACTION_ID }, query: {} });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeDefined();
        (0, vitest_1.expect)(error.statusCode).toBe(404);
    });
});
/* ================================================================== */
/*  GET /actors/:actorId/actions                                       */
/* ================================================================== */
(0, vitest_1.describe)('GET /actors/:actorId/actions', () => {
    (0, vitest_1.it)('returns 200 with paginated list scoped to actor', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.list.mockResolvedValue([(0, mocks_1.makeActionRequestRow)()]);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actors/:actorId/actions');
        const req = (0, mocks_1.createMockRequest)({ params: { actorId: mocks_1.VALID_ACTOR_ID }, query: {} });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        (0, vitest_1.expect)(payload).toHaveProperty('items');
        (0, vitest_1.expect)(payload).toHaveProperty('nextCursor');
    });
    (0, vitest_1.it)('passes actorId from params to repository', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.list.mockResolvedValue([]);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actors/:actorId/actions');
        const req = (0, mocks_1.createMockRequest)({ params: { actorId: mocks_1.VALID_ACTOR_ID }, query: {} });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(actionRequestRepo.list).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ limit: 50 }));
        const callArg = actionRequestRepo.list.mock.calls[0][0];
        (0, vitest_1.expect)(callArg.where).toBeInstanceOf(Array);
        (0, vitest_1.expect)(callArg.where.length).toBeGreaterThanOrEqual(2);
    });
});
/* ================================================================== */
/*  PATCH /actors/:actorId/actions/:actionId                           */
/* ================================================================== */
(0, vitest_1.describe)('PATCH /actors/:actorId/actions/:actionId', () => {
    (0, vitest_1.it)('returns 200 scoped to actor', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.directUpdate.mockResolvedValue((0, mocks_1.makeActionRequestRow)({ status: 'completed' }));
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'patch', '/actors/:actorId/actions/:actionId');
        const req = (0, mocks_1.createMockRequest)({
            params: { actorId: mocks_1.VALID_ACTOR_ID, actionId: mocks_1.VALID_ACTION_ID },
            query: {},
            body: { status: 'completed' },
        });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(actionRequestRepo.directUpdate).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ actionId: mocks_1.VALID_ACTION_ID }));
        const callArg = actionRequestRepo.directUpdate.mock.calls[0][0];
        (0, vitest_1.expect)(callArg.setValues.status).toBe('completed');
        (0, vitest_1.expect)(callArg.where).toBeInstanceOf(Array);
        (0, vitest_1.expect)(callArg.where.length).toBeGreaterThanOrEqual(2);
    });
    (0, vitest_1.it)('throws 404 when not found for that actor', async () => {
        const { router, actionRequestRepo } = createTestRouter();
        actionRequestRepo.directUpdate.mockResolvedValue(null);
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'patch', '/actors/:actorId/actions/:actionId');
        const req = (0, mocks_1.createMockRequest)({
            params: { actorId: 'other-actor', actionId: mocks_1.VALID_ACTION_ID },
            query: {},
            body: { status: 'completed' },
        });
        const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeDefined();
        (0, vitest_1.expect)(error.statusCode).toBe(404);
    });
});
