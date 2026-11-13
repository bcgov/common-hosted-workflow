'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
/**
 * Unit tests for POST /ui-api/wil/callback route handler.
 *
 * Strategy: build the router with mocked services and tenant repo,
 * mock global fetch for upstream call simulation, and verify each
 * behavioral path of the callback proxy.
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
const errors_1 = require('../../../src/api/utils/errors');
/* ------------------------------------------------------------------ */
/*  Test setup                                                         */
/* ------------------------------------------------------------------ */
const ALLOWED_PROJECT_IDS = ['proj-1', 'proj-2'];
const ACTOR_PRIMARY = 'user@example.com';
const ACTOR_FALLBACK = 'sub-123';
const TENANT_ID = '717626be-f59f-4e35-ac87-f84c4e11b865';
function createTestRouter(serviceOverrides = {}) {
  const actionService = {
    list: vitest_1.vi.fn().mockResolvedValue([]),
    getById: vitest_1.vi.fn().mockResolvedValue((0, mocks_1.makeActionRequestRow)()),
    updateStatus: vitest_1.vi.fn().mockResolvedValue('completed'),
    ...serviceOverrides.action,
  };
  const messageService = {
    list: vitest_1.vi.fn().mockResolvedValue([]),
    ...serviceOverrides.message,
  };
  const routeContext = {
    services: {
      action: actionService,
      message: messageService,
      tenant: { listTenants: vitest_1.vi.fn().mockResolvedValue([]) },
      uiApi: {},
    },
    customRepositories: {
      tenantProjectRelation: {},
    },
  };
  const router = (0, wil_1.buildWilRouter)(routeContext);
  return { router, actionService };
}
(0, vitest_1.beforeEach)(() => {
  resolveWilTenantProjectIdsMock.mockReset();
  resolveActorMatchersMock.mockReset();
  extractTenantIdMock.mockReset();
  resolveWilTenantProjectIdsMock.mockResolvedValue({ tenantId: TENANT_ID, projectIds: ALLOWED_PROJECT_IDS });
  extractTenantIdMock.mockReturnValue(TENANT_ID);
  resolveActorMatchersMock.mockReturnValue({
    userId: ACTOR_PRIMARY,
    userFallback: ACTOR_FALLBACK,
    roleNames: [],
    groupNames: [],
  });
});
(0, vitest_1.afterEach)(() => {
  vitest_1.vi.restoreAllMocks();
});
/* ================================================================== */
/*  POST /callback                                                     */
/* ================================================================== */
(0, vitest_1.describe)('POST /wil/callback', () => {
  (0, vitest_1.it)('returns 200 and updates status when callbackMethod is NONE', async () => {
    const action = (0, mocks_1.makeActionRequestRow)({ callbackMethod: 'NONE', callbackUrl: '' });
    const { router, actionService } = createTestRouter({
      action: { getById: vitest_1.vi.fn().mockResolvedValue(action) },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
    const req = (0, mocks_1.createMockRequest)({
      body: { actionId: 'act-99', body: { option: 'approve' } },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ success: true, message: 'Action completed' });
    (0, vitest_1.expect)(actionService.updateStatus).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({ actionId: 'act-99', status: 'completed' }),
    );
  });
  (0, vitest_1.it)('returns 200 and updates status when callbackUrl is empty', async () => {
    const action = (0, mocks_1.makeActionRequestRow)({ callbackMethod: 'POST', callbackUrl: '' });
    const { router, actionService } = createTestRouter({
      action: { getById: vitest_1.vi.fn().mockResolvedValue(action) },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
    const req = (0, mocks_1.createMockRequest)({
      body: { actionId: 'act-99', body: { option: 'approve' } },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    (0, vitest_1.expect)(actionService.updateStatus).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({ status: 'completed' }),
    );
  });
  (0, vitest_1.it)('forwards body to callbackUrl and updates status on 2xx', async () => {
    const action = (0, mocks_1.makeActionRequestRow)({
      callbackMethod: 'POST',
      callbackUrl: 'https://upstream.test/hook',
    });
    const { router, actionService } = createTestRouter({
      action: { getById: vitest_1.vi.fn().mockResolvedValue(action) },
    });
    const mockFetch = vitest_1.vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vitest_1.vi.stubGlobal('fetch', mockFetch);
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
    const req = (0, mocks_1.createMockRequest)({
      body: { actionId: 'act-99', body: { option: 'yes' } },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(mockFetch).toHaveBeenCalledWith(
      'https://upstream.test/hook',
      vitest_1.expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ option: 'yes' }),
      }),
    );
    (0, vitest_1.expect)(actionService.updateStatus).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({ status: 'completed' }),
    );
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ success: true, message: 'Action completed' });
  });
  (0, vitest_1.it)('returns upstream error without updating status on non-2xx', async () => {
    const action = (0, mocks_1.makeActionRequestRow)({
      callbackMethod: 'POST',
      callbackUrl: 'https://upstream.test/hook',
    });
    const { router, actionService } = createTestRouter({
      action: { getById: vitest_1.vi.fn().mockResolvedValue(action) },
    });
    const mockFetch = vitest_1.vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: vitest_1.vi.fn().mockResolvedValue('Service Unavailable'),
    });
    vitest_1.vi.stubGlobal('fetch', mockFetch);
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
    const req = (0, mocks_1.createMockRequest)({
      body: { actionId: 'act-99', body: { data: 'test' } },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(503);
    (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({
      error: { message: 'Service Unavailable' },
    });
    (0, vitest_1.expect)(actionService.updateStatus).not.toHaveBeenCalled();
  });
  vitest_1.it.each([409, 404, 410])(
    'auto-cancels the action and returns a cancelled response on upstream %i',
    async (upstreamStatus) => {
      const action = (0, mocks_1.makeActionRequestRow)({
        callbackMethod: 'POST',
        callbackUrl: 'https://upstream.test/hook',
      });
      const { router, actionService } = createTestRouter({
        action: { getById: vitest_1.vi.fn().mockResolvedValue(action) },
      });
      const mockFetch = vitest_1.vi.fn().mockResolvedValue({
        ok: false,
        status: upstreamStatus,
        text: vitest_1.vi
          .fn()
          .mockResolvedValue(`{"code":${upstreamStatus},"message":"The execution 3836 has finished already."}`),
      });
      vitest_1.vi.stubGlobal('fetch', mockFetch);
      const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
      const req = (0, mocks_1.createMockRequest)({
        body: { actionId: 'act-99', body: { option: 'yes' } },
        session: {},
      });
      const res = (0, mocks_1.createMockResponse)();
      const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
      (0, vitest_1.expect)(error).toBeNull();
      (0, vitest_1.expect)(actionService.updateStatus).toHaveBeenCalledWith(
        vitest_1.expect.objectContaining({ status: 'cancelled', cancellationReason: vitest_1.expect.any(String) }),
      );
      (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
      (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(
        vitest_1.expect.objectContaining({ success: false, cancelled: true, message: vitest_1.expect.any(String) }),
      );
    },
  );
  (0, vitest_1.it)('does NOT cancel and passes through other non-2xx codes (e.g. 500)', async () => {
    const action = (0, mocks_1.makeActionRequestRow)({
      callbackMethod: 'POST',
      callbackUrl: 'https://upstream.test/hook',
    });
    const { router, actionService } = createTestRouter({
      action: { getById: vitest_1.vi.fn().mockResolvedValue(action) },
    });
    const mockFetch = vitest_1.vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vitest_1.vi.fn().mockResolvedValue('Internal Server Error'),
    });
    vitest_1.vi.stubGlobal('fetch', mockFetch);
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
    const req = (0, mocks_1.createMockRequest)({
      body: { actionId: 'act-99', body: { data: 'test' } },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(500);
    (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ error: { message: 'Internal Server Error' } });
    (0, vitest_1.expect)(actionService.updateStatus).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('throws 504 AppError on upstream timeout', async () => {
    const action = (0, mocks_1.makeActionRequestRow)({
      callbackMethod: 'POST',
      callbackUrl: 'https://upstream.test/hook',
    });
    const { router } = createTestRouter({ action: { getById: vitest_1.vi.fn().mockResolvedValue(action) } });
    const timeoutError = new Error('The operation was aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    const mockFetch = vitest_1.vi.fn().mockRejectedValue(timeoutError);
    vitest_1.vi.stubGlobal('fetch', mockFetch);
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
    const req = (0, mocks_1.createMockRequest)({
      body: { actionId: 'act-99', body: {} },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
    (0, vitest_1.expect)(error.statusCode).toBe(504);
    (0, vitest_1.expect)(error.message).toBe('Upstream timeout');
  });
  (0, vitest_1.it)('throws 502 AppError on upstream network error', async () => {
    const action = (0, mocks_1.makeActionRequestRow)({
      callbackMethod: 'POST',
      callbackUrl: 'https://upstream.test/hook',
    });
    const { router } = createTestRouter({ action: { getById: vitest_1.vi.fn().mockResolvedValue(action) } });
    const networkError = new Error('ECONNREFUSED');
    const mockFetch = vitest_1.vi.fn().mockRejectedValue(networkError);
    vitest_1.vi.stubGlobal('fetch', mockFetch);
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
    const req = (0, mocks_1.createMockRequest)({
      body: { actionId: 'act-99', body: {} },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
    (0, vitest_1.expect)(error.statusCode).toBe(502);
    (0, vitest_1.expect)(error.message).toBe('Upstream request failed');
  });
  (0, vitest_1.it)('propagates error when status update fails after successful upstream call', async () => {
    const action = (0, mocks_1.makeActionRequestRow)({
      callbackMethod: 'POST',
      callbackUrl: 'https://upstream.test/hook',
    });
    const updateStatusMock = vitest_1.vi.fn().mockRejectedValue(new Error('DB write failed'));
    const { router } = createTestRouter({
      action: {
        getById: vitest_1.vi.fn().mockResolvedValue(action),
        updateStatus: updateStatusMock,
      },
    });
    const mockFetch = vitest_1.vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vitest_1.vi.stubGlobal('fetch', mockFetch);
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
    const req = (0, mocks_1.createMockRequest)({
      body: { actionId: 'act-99', body: { option: 'yes' } },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeInstanceOf(Error);
    (0, vitest_1.expect)(error.message).toBe('DB write failed');
  });
  (0, vitest_1.it)('propagates AppError when action is not found', async () => {
    const getByIdMock = vitest_1.vi.fn().mockRejectedValue(new errors_1.AppError(404, 'Action not found'));
    const { router } = createTestRouter({ action: { getById: getByIdMock } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
    const req = (0, mocks_1.createMockRequest)({
      body: { actionId: 'nonexistent', body: {} },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
    (0, vitest_1.expect)(error.statusCode).toBe(404);
  });
  (0, vitest_1.it)('uses the callbackMethod from the action record', async () => {
    const action = (0, mocks_1.makeActionRequestRow)({
      callbackMethod: 'PUT',
      callbackUrl: 'https://upstream.test/hook',
    });
    const { router } = createTestRouter({ action: { getById: vitest_1.vi.fn().mockResolvedValue(action) } });
    const mockFetch = vitest_1.vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vitest_1.vi.stubGlobal('fetch', mockFetch);
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
    const req = (0, mocks_1.createMockRequest)({
      body: { actionId: 'act-99', body: { key: 'val' } },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(mockFetch).toHaveBeenCalledWith(
      'https://upstream.test/hook',
      vitest_1.expect.objectContaining({ method: 'PUT' }),
    );
  });
  (0, vitest_1.it)('rejects request with empty actionId via validation middleware', async () => {
    const { router } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
    const req = (0, mocks_1.createMockRequest)({
      body: { actionId: '', body: {} },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
    (0, vitest_1.expect)(error.statusCode).toBe(400);
  });
  (0, vitest_1.it)('rejects request with missing actionId via validation middleware', async () => {
    const { router } = createTestRouter();
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/callback');
    const req = (0, mocks_1.createMockRequest)({
      body: { body: {} },
      session: {},
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
    (0, vitest_1.expect)(error.statusCode).toBe(400);
  });
});
