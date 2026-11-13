'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
/**
 * Unit tests for the message route handlers in
 * `src/api/routes/messages.ts`.
 *
 * Strategy: register the routes on an Express router, then invoke
 * each registered handler directly with mock req/res/next objects.
 * Middleware (auth, tenant) is stubbed as pass-through so we test only
 * the handler logic, schema validation, and repository interactions.
 */
const vitest_1 = require('vitest');
const messages_1 = require('../../../src/api/routes/messages');
const mocks_1 = require('../../helpers/mocks');
const test_utils_1 = require('../../helpers/test-utils');
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
  const router = (0, messages_1.buildMessageRouter)(routeContext);
  return { router, messageRepo, n8nRepos };
}
/* ================================================================== */
/*  GET /messages/                                                     */
/* ================================================================== */
(0, vitest_1.describe)('GET /messages/', () => {
  (0, vitest_1.it)('returns 200 with items and nextCursor', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.list.mockResolvedValue([(0, mocks_1.makeMessageRow)()]);
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages/');
    const req = (0, mocks_1.createMockRequest)({ params: {}, query: {} });
    const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    (0, vitest_1.expect)(payload).toHaveProperty('items');
    (0, vitest_1.expect)(payload).toHaveProperty('nextCursor');
  });
  (0, vitest_1.it)('returns nextCursor when repo returns one more row than pageLimit (overfetch signal)', async () => {
    const { router, messageRepo } = createTestRouter();
    // The repository overfetches by 1 (limit + 1) so the route can detect a real
    // next page. 51 rows for a limit of 50 means there IS another page.
    messageRepo.list.mockResolvedValue(
      Array.from({ length: 51 }, (_, i) => (0, mocks_1.makeMessageRow)({ id: `msg-${String(i).padStart(3, '0')}` })),
    );
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages/');
    const req = (0, mocks_1.createMockRequest)({ params: {}, query: {} });
    const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    const payload = res.json.mock.calls[0][0];
    (0, vitest_1.expect)(payload.nextCursor).not.toBeNull();
    // The extra overfetched row must be trimmed from the response.
    (0, vitest_1.expect)(payload.items).toHaveLength(50);
  });
  (0, vitest_1.it)('returns nextCursor as null when the result set ends exactly on the page boundary', async () => {
    // Regression test: previously the route assumed rows.length === limit meant
    // "there might be more," which produced a nextCursor pointing past the last row
    // and an empty response on the next "Load More" click. The repo now returns
    // exactly `limit` rows (not limit + 1) whenever the result set truly ends there.
    const { router, messageRepo } = createTestRouter();
    messageRepo.list.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => (0, mocks_1.makeMessageRow)({ id: `msg-${String(i).padStart(3, '0')}` })),
    );
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages/');
    const req = (0, mocks_1.createMockRequest)({ params: {}, query: {} });
    const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    const payload = res.json.mock.calls[0][0];
    (0, vitest_1.expect)(payload.nextCursor).toBeNull();
    (0, vitest_1.expect)(payload.items).toHaveLength(50);
  });
  (0, vitest_1.it)('returns nextCursor as null when fewer items than limit', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.list.mockResolvedValue([(0, mocks_1.makeMessageRow)()]);
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages/');
    const req = (0, mocks_1.createMockRequest)({ params: {}, query: {} });
    const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(res.json.mock.calls[0][0].nextCursor).toBeNull();
  });
  (0, vitest_1.it)('filters by optional actorId query param', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.list.mockResolvedValue([]);
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages/');
    const req = (0, mocks_1.createMockRequest)({ params: {}, query: { actorId: 'specific-actor' } });
    const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(messageRepo.list).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ limit: 50 }));
    const callArg = messageRepo.list.mock.calls[0][0];
    (0, vitest_1.expect)(callArg.where).toBeInstanceOf(Array);
    (0, vitest_1.expect)(callArg.where.length).toBeGreaterThanOrEqual(2);
  });
});
/* ================================================================== */
/*  POST /messages/                                                    */
/* ================================================================== */
(0, vitest_1.describe)('POST /messages/', () => {
  const validBody = {
    title: 'Alert',
    body: 'Something happened',
    actorId: mocks_1.VALID_ACTOR_ID,
    actorType: 'user',
    workflowInstanceId: mocks_1.VALID_EXECUTION_ID,
    workflowId: mocks_1.VALID_WORKFLOW_ID,
  };
  (0, vitest_1.it)('returns 201 with created message on valid input', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.create.mockResolvedValue((0, mocks_1.makeMessageRow)());
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/messages/');
    const req = (0, mocks_1.createMockRequest)({ params: {}, query: {}, body: validBody });
    const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(201);
    (0, vitest_1.expect)(res.json).toHaveBeenCalled();
  });
  (0, vitest_1.it)('defaults status to "active" when omitted', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.create.mockResolvedValue((0, mocks_1.makeMessageRow)());
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/messages/');
    const req = (0, mocks_1.createMockRequest)({ params: {}, query: {}, body: validBody });
    const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(messageRepo.create).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({ status: 'active' }),
    );
  });
  (0, vitest_1.it)('defaults metadata to null when omitted', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.create.mockResolvedValue((0, mocks_1.makeMessageRow)());
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/messages/');
    const req = (0, mocks_1.createMockRequest)({ params: {}, query: {}, body: validBody });
    const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(messageRepo.create).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ metadata: null }));
  });
  (0, vitest_1.it)('returns validation error for missing required fields', async () => {
    const { router } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/messages/');
    const req = (0, mocks_1.createMockRequest)({ params: {}, query: {}, body: {} });
    const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeDefined();
    (0, vitest_1.expect)(error.statusCode).toBe(400);
  });
  (0, vitest_1.it)('throws 500 when DB insert fails', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.create.mockRejectedValue(new Error('DB constraint violation'));
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/messages/');
    const req = (0, mocks_1.createMockRequest)({ params: {}, query: {}, body: validBody });
    const res = (0, mocks_1.createMockResponse)({ chwfAllowedProjectIds: [mocks_1.VALID_PROJECT_ID] });
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeDefined();
    (0, vitest_1.expect)(error.statusCode).toBe(500);
  });
});
