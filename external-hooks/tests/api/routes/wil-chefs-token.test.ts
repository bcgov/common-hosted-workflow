/**
 * Unit tests for the CHEFS token exchange route handler
 * `POST /ui-api/wil/chefs-token` in `src/api/routes/wil.ts`.
 *
 * Strategy: build the router with mocked services and tenant repo,
 * mock `resolveWilTenantProjectIds` and `resolveActorIds` at module level,
 * and mock global `fetch` for the CHEFS gateway call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { createMockRequest, createMockResponse } from '../../helpers/mocks';
import { getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';
import { AppError } from '../../../src/api/utils/errors';

/* ------------------------------------------------------------------ */
/*  Test setup                                                         */
/* ------------------------------------------------------------------ */

const ALLOWED_PROJECT_IDS = ['proj-1', 'proj-2'];
const ACTOR_PRIMARY = 'user@example.com';
const ACTOR_FALLBACK = 'sub-123';

const SHOWFORM_ACTION = {
  id: 'act-001',
  actionType: 'showform',
  payload: {
    formApiKey: 'test-api-key-abc', // pragma: allowlist secret
    formId: 'form-123',
    formName: 'Test Form',
  },
  callbackUrl: 'https://example.com/callback',
  callbackMethod: 'POST',
  actorId: ACTOR_PRIMARY,
  status: 'pending',
};

function createTestRouter(serviceOverrides: Record<string, any> = {}) {
  const actionService = {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(SHOWFORM_ACTION),
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
  vi.restoreAllMocks();

  resolveWilTenantProjectIdsMock.mockResolvedValue(ALLOWED_PROJECT_IDS);
  resolveActorIdsMock.mockReturnValue({ primary: ACTOR_PRIMARY, fallback: ACTOR_FALLBACK });
});

/* ================================================================== */
/*  POST /chefs-token                                                  */
/* ================================================================== */

describe('POST /wil/chefs-token', () => {
  it('returns 200 with authToken, formId, formName on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'jwt-token-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual({
      authToken: 'jwt-token-123',
      formId: 'form-123',
      formName: 'Test Form',
    });
  });

  it('calls CHEFS gateway with correct Basic auth header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'jwt-token-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    const expectedCredentials = Buffer.from('form-123:test-api-key-abc').toString('base64');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/token/forms/form-123'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${expectedCredentials}`,
        }),
      }),
    );
  });

  it('uses default CHEFS_GATEWAY_URL when env is not set', async () => {
    delete process.env.CHEFS_GATEWAY_URL;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'jwt-token-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://submit.digital.gov.bc.ca/app/gateway/v1/auth/token/forms/form-123',
      expect.anything(),
    );
  });

  it('uses custom CHEFS_GATEWAY_URL when env is set', async () => {
    process.env.CHEFS_GATEWAY_URL = 'https://custom-gateway.example.com/v1';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'jwt-token-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://custom-gateway.example.com/v1/auth/token/forms/form-123',
      expect.anything(),
    );
    delete process.env.CHEFS_GATEWAY_URL;
  });

  it('throws AppError 400 when action type is not showform', async () => {
    const nonShowformAction = { ...SHOWFORM_ACTION, actionType: 'getapproval' };
    const { router } = createTestRouter({ action: { getById: vi.fn().mockResolvedValue(nonShowformAction) } });
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(400);
    expect((error as AppError).message).toBe('Invalid action type');
  });

  it('throws AppError 400 when formApiKey is missing from payload', async () => {
    const actionWithoutKey = {
      ...SHOWFORM_ACTION,
      payload: { formId: 'form-123', formName: 'Test Form' },
    };
    const { router } = createTestRouter({ action: { getById: vi.fn().mockResolvedValue(actionWithoutKey) } });
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(400);
    expect((error as AppError).message).toBe('Missing formApiKey');
  });

  it('throws AppError 404 when action is not found (service throws)', async () => {
    const notFoundError = new AppError(404, 'Action not found');
    const { router } = createTestRouter({ action: { getById: vi.fn().mockRejectedValue(notFoundError) } });
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'nonexistent' }, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(404);
  });

  it('throws AppError 502 when CHEFS gateway returns non-2xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });
    vi.stubGlobal('fetch', mockFetch);

    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(502);
    expect((error as AppError).message).toBe('CHEFS token exchange failed');
  });

  it('throws AppError 502 when fetch throws a network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(502);
    expect((error as AppError).message).toBe('CHEFS token exchange failed');
  });

  it('calls getById with resolved tenant project IDs and primary actor', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'jwt-token-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const getByIdMock = vi.fn().mockResolvedValue(SHOWFORM_ACTION);
    const { router } = createTestRouter({ action: { getById: getByIdMock } });
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(getByIdMock).toHaveBeenCalledWith({
      allowedProjectIds: ALLOWED_PROJECT_IDS,
      actionId: 'act-001',
      actorId: ACTOR_PRIMARY,
    });
  });

  it('validation rejects missing actionId', async () => {
    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: {}, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(400);
  });

  it('validation rejects empty actionId', async () => {
    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: '' }, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(400);
  });
});
