/**
 * Unit tests for POST /ui-api/wil/callback route handler.
 *
 * Strategy: build the router with mocked services and tenant repo,
 * mock global fetch for upstream call simulation, and verify each
 * behavioral path of the callback proxy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Module mocks                                                       */
/* ------------------------------------------------------------------ */

const { resolveWilTenantProjectIdsMock, resolveActorIdsMock } = vi.hoisted(() => ({
  resolveWilTenantProjectIdsMock: vi.fn(),
  resolveActorIdsMock: vi.fn(),
}));

vi.mock('../../../src/api/routes/helpers/wil-tenant', () => ({
  resolveWilTenantProjectIds: resolveWilTenantProjectIdsMock,
}));

vi.mock('../../../src/api/routes/helpers/wil-actor', () => ({
  resolveActorIds: resolveActorIdsMock,
}));

/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */

import { buildWilRouter } from '../../../src/api/routes/wil';
import { createMockRequest, createMockResponse, makeActionRequestRow } from '../../helpers/mocks';
import { getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';
import { AppError } from '../../../src/api/utils/errors';

/* ------------------------------------------------------------------ */
/*  Test setup                                                         */
/* ------------------------------------------------------------------ */

const ALLOWED_PROJECT_IDS = ['proj-1', 'proj-2'];
const ACTOR_PRIMARY = 'user@example.com';
const ACTOR_FALLBACK = 'sub-123';

function createTestRouter(serviceOverrides: Record<string, any> = {}) {
  const actionService = {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(makeActionRequestRow()),
    updateStatus: vi.fn().mockResolvedValue('completed'),
    ...serviceOverrides.action,
  };
  const messageService = {
    list: vi.fn().mockResolvedValue([]),
    ...serviceOverrides.message,
  };

  const routeContext = {
    services: {
      action: actionService,
      message: messageService,
      tenant: { listTenants: vi.fn().mockResolvedValue([]) },
      uiApi: {} as any,
    },
    customRepositories: {
      tenantProjectRelation: {} as any,
    },
  } as any;

  const router = buildWilRouter(routeContext);
  return { router, actionService };
}

beforeEach(() => {
  resolveWilTenantProjectIdsMock.mockReset();
  resolveActorIdsMock.mockReset();

  resolveWilTenantProjectIdsMock.mockResolvedValue(ALLOWED_PROJECT_IDS);
  resolveActorIdsMock.mockReturnValue({ primary: ACTOR_PRIMARY, fallback: ACTOR_FALLBACK });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ================================================================== */
/*  POST /callback                                                     */
/* ================================================================== */

describe('POST /wil/callback', () => {
  it('returns 200 and updates status when callbackMethod is NONE', async () => {
    const action = makeActionRequestRow({ callbackMethod: 'NONE', callbackUrl: '' });
    const { router, actionService } = createTestRouter({ action: { getById: vi.fn().mockResolvedValue(action) } });

    const handlers = getRouteHandlers(router, 'post', '/callback');
    const req = createMockRequest({
      body: { actionId: 'act-99', body: { option: 'approve' } },
      session: {} as any,
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Action completed' });
    expect(actionService.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'act-99', status: 'completed' }),
    );
  });

  it('returns 200 and updates status when callbackUrl is empty', async () => {
    const action = makeActionRequestRow({ callbackMethod: 'POST', callbackUrl: '' });
    const { router, actionService } = createTestRouter({ action: { getById: vi.fn().mockResolvedValue(action) } });

    const handlers = getRouteHandlers(router, 'post', '/callback');
    const req = createMockRequest({
      body: { actionId: 'act-99', body: { option: 'approve' } },
      session: {} as any,
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(actionService.updateStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });

  it('forwards body to callbackUrl and updates status on 2xx', async () => {
    const action = makeActionRequestRow({ callbackMethod: 'POST', callbackUrl: 'https://upstream.test/hook' });
    const { router, actionService } = createTestRouter({ action: { getById: vi.fn().mockResolvedValue(action) } });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/callback');
    const req = createMockRequest({
      body: { actionId: 'act-99', body: { option: 'yes' } },
      session: {} as any,
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://upstream.test/hook',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ option: 'yes' }),
      }),
    );
    expect(actionService.updateStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Action completed' });
  });

  it('returns upstream error without updating status on non-2xx', async () => {
    const action = makeActionRequestRow({ callbackMethod: 'POST', callbackUrl: 'https://upstream.test/hook' });
    const { router, actionService } = createTestRouter({ action: { getById: vi.fn().mockResolvedValue(action) } });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue('Service Unavailable'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/callback');
    const req = createMockRequest({
      body: { actionId: 'act-99', body: { data: 'test' } },
      session: {} as any,
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'Service Unavailable' },
    });
    expect(actionService.updateStatus).not.toHaveBeenCalled();
  });

  it('throws 504 AppError on upstream timeout', async () => {
    const action = makeActionRequestRow({ callbackMethod: 'POST', callbackUrl: 'https://upstream.test/hook' });
    const { router } = createTestRouter({ action: { getById: vi.fn().mockResolvedValue(action) } });

    const timeoutError = new Error('The operation was aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    const mockFetch = vi.fn().mockRejectedValue(timeoutError);
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/callback');
    const req = createMockRequest({
      body: { actionId: 'act-99', body: {} },
      session: {} as any,
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(504);
    expect((error as AppError).message).toBe('Upstream timeout');
  });

  it('throws 502 AppError on upstream network error', async () => {
    const action = makeActionRequestRow({ callbackMethod: 'POST', callbackUrl: 'https://upstream.test/hook' });
    const { router } = createTestRouter({ action: { getById: vi.fn().mockResolvedValue(action) } });

    const networkError = new Error('ECONNREFUSED');
    const mockFetch = vi.fn().mockRejectedValue(networkError);
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/callback');
    const req = createMockRequest({
      body: { actionId: 'act-99', body: {} },
      session: {} as any,
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(502);
    expect((error as AppError).message).toBe('Upstream request failed');
  });

  it('propagates error when status update fails after successful upstream call', async () => {
    const action = makeActionRequestRow({ callbackMethod: 'POST', callbackUrl: 'https://upstream.test/hook' });
    const updateStatusMock = vi.fn().mockRejectedValue(new Error('DB write failed'));
    const { router } = createTestRouter({
      action: {
        getById: vi.fn().mockResolvedValue(action),
        updateStatus: updateStatusMock,
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/callback');
    const req = createMockRequest({
      body: { actionId: 'act-99', body: { option: 'yes' } },
      session: {} as any,
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('DB write failed');
  });

  it('propagates AppError when action is not found', async () => {
    const getByIdMock = vi.fn().mockRejectedValue(new AppError(404, 'Action not found'));
    const { router } = createTestRouter({ action: { getById: getByIdMock } });

    const handlers = getRouteHandlers(router, 'post', '/callback');
    const req = createMockRequest({
      body: { actionId: 'nonexistent', body: {} },
      session: {} as any,
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(404);
  });

  it('uses the callbackMethod from the action record', async () => {
    const action = makeActionRequestRow({ callbackMethod: 'PUT', callbackUrl: 'https://upstream.test/hook' });
    const { router } = createTestRouter({ action: { getById: vi.fn().mockResolvedValue(action) } });

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = getRouteHandlers(router, 'post', '/callback');
    const req = createMockRequest({
      body: { actionId: 'act-99', body: { key: 'val' } },
      session: {} as any,
    });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(mockFetch).toHaveBeenCalledWith('https://upstream.test/hook', expect.objectContaining({ method: 'PUT' }));
  });

  it('rejects request with empty actionId via validation middleware', async () => {
    const { router } = createTestRouter();

    const handlers = getRouteHandlers(router, 'post', '/callback');
    const req = createMockRequest({
      body: { actionId: '', body: {} },
      session: {} as any,
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(400);
  });

  it('rejects request with missing actionId via validation middleware', async () => {
    const { router } = createTestRouter();

    const handlers = getRouteHandlers(router, 'post', '/callback');
    const req = createMockRequest({
      body: { body: {} },
      session: {} as any,
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(400);
  });
});
