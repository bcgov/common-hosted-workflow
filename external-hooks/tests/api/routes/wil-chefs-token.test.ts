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

const { resolveWilTenantProjectIdsMock, resolveActorMatchersMock, extractTenantIdMock } = vi.hoisted(() => ({
  resolveWilTenantProjectIdsMock: vi.fn(),
  resolveActorMatchersMock: vi.fn(),
  extractTenantIdMock: vi.fn(),
}));

vi.mock('../../../src/api/routes/helpers/wil-tenant', () => ({
  resolveWilTenantProjectIds: resolveWilTenantProjectIdsMock,
  extractTenantId: extractTenantIdMock,
}));

vi.mock('../../../src/api/routes/helpers/wil-actor', () => ({
  resolveActorMatchers: resolveActorMatchersMock,
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
const TENANT_ID = '717626be-f59f-4e35-ac87-f84c4e11b865';

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
  const chefsService = {
    getFormToken: vi.fn().mockResolvedValue({
      authToken: 'jwt-token-123',
      formId: 'form-123',
      baseUrl: 'https://submit.digital.gov.bc.ca/app',
    }),
    ...serviceOverrides.chefs,
  };

  const routeContext = {
    services: {
      action: actionService,
      message: messageService,
      chefs: chefsService,
      uiApi: {} as any,
    },
    customRepositories: {
      tenantProjectRelation: {} as any,
    },
  } as any;

  const router = buildWilRouter(routeContext);
  return { router, actionService, chefsService };
}

beforeEach(() => {
  resolveWilTenantProjectIdsMock.mockReset();
  resolveActorMatchersMock.mockReset();
  extractTenantIdMock.mockReset();
  vi.restoreAllMocks();

  resolveWilTenantProjectIdsMock.mockResolvedValue({ tenantId: TENANT_ID, projectIds: ALLOWED_PROJECT_IDS });
  extractTenantIdMock.mockReturnValue(TENANT_ID);
  resolveActorMatchersMock.mockReturnValue({
    userId: ACTOR_PRIMARY,
    userFallback: ACTOR_FALLBACK,
    roleNames: [],
    groupNames: [],
  });
});

/* ================================================================== */
/*  POST /chefs-token                                                  */
/* ================================================================== */

describe('POST /wil/chefs-token', () => {
  it('returns 200 with authToken, formId, formName on success', async () => {
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
      baseUrl: 'https://submit.digital.gov.bc.ca/app',
    });
  });

  it('calls ChefsService.getFormToken with correct formId and formApiKey', async () => {
    const { router, chefsService } = createTestRouter();
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(chefsService.getFormToken).toHaveBeenCalledWith({
      formId: 'form-123',
      formApiKey: 'test-api-key-abc', // pragma: allowlist secret
    });
  });

  it('returns baseUrl from ChefsService response', async () => {
    const { router } = createTestRouter({
      chefs: {
        getFormToken: vi.fn().mockResolvedValue({
          authToken: 'token-abc',
          formId: 'form-123',
          baseUrl: 'https://custom.example.com/app',
        }),
      },
    });
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    const payload = res.json.mock.calls[0][0];
    expect(payload.baseUrl).toBe('https://custom.example.com/app');
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

  it('throws AppError 502 when ChefsService rejects with gateway error', async () => {
    const { router } = createTestRouter({
      chefs: {
        getFormToken: vi.fn().mockRejectedValue(new AppError(502, 'CHEFS token exchange failed')),
      },
    });
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(502);
    expect((error as AppError).message).toBe('CHEFS token exchange failed');
  });

  it('throws AppError 502 when ChefsService rejects with network error', async () => {
    const { router } = createTestRouter({
      chefs: {
        getFormToken: vi.fn().mockRejectedValue(new AppError(502, 'CHEFS token exchange failed')),
      },
    });
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(502);
    expect((error as AppError).message).toBe('CHEFS token exchange failed');
  });

  it('calls getById with resolved tenant project IDs and actor matchers', async () => {
    const getByIdMock = vi.fn().mockResolvedValue(SHOWFORM_ACTION);
    const { router } = createTestRouter({ action: { getById: getByIdMock } });
    const handlers = getRouteHandlers(router, 'post', '/chefs-token');
    const req = createMockRequest({ body: { actionId: 'act-001' }, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(getByIdMock).toHaveBeenCalledWith({
      allowedProjectIds: ALLOWED_PROJECT_IDS,
      actionId: 'act-001',
      actorMatchers: { userId: ACTOR_PRIMARY, userFallback: ACTOR_FALLBACK, roleNames: [], groupNames: [] },
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
