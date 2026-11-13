'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
/**
 * Unit tests for the WIL (Workflow Interaction Layer) UI-facing routes
 * in `src/api/routes/wil.ts`.
 *
 * Strategy: build the router with mocked services and tenant repo,
 * then invoke each handler directly using the Express router stack.
 * The `resolveWilTenantProjectIds` and `resolveActorIds` helpers are
 * mocked at the module level so we test only the route handler logic.
 */
const vitest_1 = require('vitest');
/* ------------------------------------------------------------------ */
/*  Module mocks                                                       */
/* ------------------------------------------------------------------ */
const { resolveWilTenantProjectIdsMock, resolveActorMatchersMock, extractTenantIdMock } = vitest_1.vi.hoisted(() => ({
  resolveWilTenantProjectIdsMock: vitest_1.vi.fn(),
  resolveActorMatchersMock: vitest_1.vi.fn(),
  extractTenantIdMock: vitest_1.vi.fn(),
}));
vitest_1.vi.mock('../../../src/api/routes/helpers/wil-tenant', () => ({
  resolveWilTenantProjectIds: resolveWilTenantProjectIdsMock,
  extractTenantId: extractTenantIdMock,
}));
vitest_1.vi.mock('../../../src/api/routes/helpers/wil-actor', () => ({
  resolveActorMatchers: resolveActorMatchersMock,
}));
/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */
const wil_1 = require('../../../src/api/routes/wil');
const mocks_1 = require('../../helpers/mocks');
const test_utils_1 = require('../../helpers/test-utils');
/* ------------------------------------------------------------------ */
/*  Test setup                                                         */
/* ------------------------------------------------------------------ */
const ALLOWED_PROJECT_IDS = ['proj-1', 'proj-2'];
const ACTOR_PRIMARY = 'user@example.com';
const ACTOR_FALLBACK = 'sub-123';
const TENANT_ID = '717626be-f59f-4e35-ac87-f84c4e11b865';
const DEFAULT_ACTOR_MATCHERS = {
  userId: ACTOR_PRIMARY,
  userFallback: ACTOR_FALLBACK,
  roleNames: [],
  groupNames: [],
};
function createTestRouter(serviceOverrides = {}) {
  const messageService = {
    list: vitest_1.vi.fn().mockResolvedValue([]),
    ...serviceOverrides.message,
  };
  const actionService = {
    list: vitest_1.vi.fn().mockResolvedValue([]),
    ...serviceOverrides.action,
  };
  const routeContext = {
    services: {
      message: messageService,
      action: actionService,
      uiApi: {},
    },
    customRepositories: {
      tenantProjectRelation: {},
    },
  };
  const router = (0, wil_1.buildWilRouter)(routeContext);
  return { router, messageService, actionService };
}
(0, vitest_1.beforeEach)(() => {
  resolveWilTenantProjectIdsMock.mockReset();
  resolveActorMatchersMock.mockReset();
  extractTenantIdMock.mockReset();
  resolveWilTenantProjectIdsMock.mockResolvedValue({ tenantId: TENANT_ID, projectIds: ALLOWED_PROJECT_IDS });
  extractTenantIdMock.mockReturnValue(TENANT_ID);
  resolveActorMatchersMock.mockReturnValue(DEFAULT_ACTOR_MATCHERS);
});
/* ================================================================== */
/*  GET /messages                                                      */
/* ================================================================== */
(0, vitest_1.describe)('GET /wil/messages', () => {
  (0, vitest_1.it)('returns 200 with data and nextCursor', async () => {
    const items = [(0, mocks_1.makeMessageRow)({ id: 'msg-1', createdAt: new Date('2025-06-01T12:00:00.000Z') })];
    const { router, messageService } = createTestRouter({
      message: { list: vitest_1.vi.fn().mockResolvedValue(items) },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    (0, vitest_1.expect)(payload).toHaveProperty('data');
    (0, vitest_1.expect)(payload).toHaveProperty('nextCursor');
  });
  (0, vitest_1.it)('calls message service with resolved tenant project IDs', async () => {
    const { router, messageService } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(messageService.list).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({ allowedProjectIds: ALLOWED_PROJECT_IDS }),
    );
  });
  (0, vitest_1.it)('passes actor matchers to service', async () => {
    const { router, messageService } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(messageService.list).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({ actorMatchers: DEFAULT_ACTOR_MATCHERS }),
    );
  });
  (0, vitest_1.it)('calls service once with actor matchers (no fallback retry)', async () => {
    const listMock = vitest_1.vi.fn().mockResolvedValue([]);
    const { router } = createTestRouter({ message: { list: listMock } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(listMock).toHaveBeenCalledTimes(1);
  });
  (0, vitest_1.it)('parses limit query parameter', async () => {
    const { router, messageService } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages');
    const req = (0, mocks_1.createMockRequest)({ query: { limit: '50' }, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(messageService.list).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ limit: 50 }));
  });
  (0, vitest_1.it)('parses since query parameter as time mode', async () => {
    const { router, messageService } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages');
    const req = (0, mocks_1.createMockRequest)({ query: { since: '2025-06-01T12:00:00.000Z' }, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(messageService.list).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({
        since: { mode: 'time', since: new Date('2025-06-01T12:00:00.000Z') },
      }),
    );
  });
  (0, vitest_1.it)('parses since query parameter as cursor mode', async () => {
    const { router, messageService } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages');
    const req = (0, mocks_1.createMockRequest)({
      query: { since: '2025-06-01T12:00:00.000Z|msg-abc' },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(messageService.list).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({
        since: { mode: 'cursor', createdAt: new Date('2025-06-01T12:00:00.000Z'), id: 'msg-abc' },
      }),
    );
  });
  (0, vitest_1.it)('forwards error to next when tenant resolution fails', async () => {
    const tenantError = new Error('tenant failure');
    resolveWilTenantProjectIdsMock.mockRejectedValue(tenantError);
    const { router } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBe(tenantError);
  });
  (0, vitest_1.it)('forwards error to next when service throws', async () => {
    const serviceError = new Error('service failure');
    const listMock = vitest_1.vi.fn().mockRejectedValue(serviceError);
    const { router } = createTestRouter({ message: { list: listMock } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/messages');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBe(serviceError);
  });
});
/* ================================================================== */
/*  GET /actions                                                       */
/* ================================================================== */
(0, vitest_1.describe)('GET /wil/actions', () => {
  (0, vitest_1.it)('returns 200 with data and nextCursor', async () => {
    const items = [(0, mocks_1.makeActionRequestRow)({ id: 'act-1', createdAt: new Date('2025-06-01T12:00:00.000Z') })];
    const { router, actionService } = createTestRouter({ action: { list: vitest_1.vi.fn().mockResolvedValue(items) } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    (0, vitest_1.expect)(payload).toHaveProperty('data');
    (0, vitest_1.expect)(payload).toHaveProperty('nextCursor');
  });
  (0, vitest_1.it)('calls action service with resolved tenant project IDs', async () => {
    const { router, actionService } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(actionService.list).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({ allowedProjectIds: ALLOWED_PROJECT_IDS }),
    );
  });
  (0, vitest_1.it)('passes actor matchers to service', async () => {
    const { router, actionService } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(actionService.list).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({ actorMatchers: DEFAULT_ACTOR_MATCHERS }),
    );
  });
  (0, vitest_1.it)('calls service once with actor matchers (no fallback retry)', async () => {
    const listMock = vitest_1.vi.fn().mockResolvedValue([]);
    const { router } = createTestRouter({ action: { list: listMock } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(listMock).toHaveBeenCalledTimes(1);
  });
  (0, vitest_1.it)('parses limit query parameter', async () => {
    const { router, actionService } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
    const req = (0, mocks_1.createMockRequest)({ query: { limit: '100' }, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(actionService.list).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ limit: 100 }));
  });
  (0, vitest_1.it)('parses since query parameter', async () => {
    const { router, actionService } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
    const req = (0, mocks_1.createMockRequest)({
      query: { since: '2025-06-01T12:00:00.000Z|act-xyz' },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(actionService.list).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({
        since: { mode: 'cursor', createdAt: new Date('2025-06-01T12:00:00.000Z'), id: 'act-xyz' },
      }),
    );
  });
  (0, vitest_1.it)('uses default limit when not specified', async () => {
    const { router, actionService } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(actionService.list).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ limit: 20 }));
  });
  (0, vitest_1.it)('forwards error to next when tenant resolution fails', async () => {
    const tenantError = new Error('tenant failure');
    resolveWilTenantProjectIdsMock.mockRejectedValue(tenantError);
    const { router } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBe(tenantError);
  });
  (0, vitest_1.it)('forwards error to next when service throws', async () => {
    const serviceError = new Error('service failure');
    const listMock = vitest_1.vi.fn().mockRejectedValue(serviceError);
    const { router } = createTestRouter({ action: { list: listMock } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/actions');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: {} });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBe(serviceError);
  });
});
