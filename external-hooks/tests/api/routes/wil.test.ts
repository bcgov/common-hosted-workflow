/**
 * Unit tests for the WIL (Workflow Interaction Layer) UI-facing routes
 * in `src/api/routes/wil.ts`.
 *
 * Strategy: build the router with mocked services and tenant repo,
 * then invoke each handler directly using the Express router stack.
 * The `resolveWilTenantProjectIds` and `resolveActorIds` helpers are
 * mocked at the module level so we test only the route handler logic.
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
import { createMockRequest, createMockResponse, makeMessageRow, makeActionRequestRow } from '../../helpers/mocks';
import { getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';

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

function createTestRouter(serviceOverrides: Record<string, any> = {}) {
  const messageService = {
    list: vi.fn().mockResolvedValue([]),
    ...serviceOverrides.message,
  };
  const actionService = {
    list: vi.fn().mockResolvedValue([]),
    ...serviceOverrides.action,
  };

  const routeContext = {
    services: {
      message: messageService,
      action: actionService,
      uiApi: {} as any,
    },
    customRepositories: {
      tenantProjectRelation: {} as any,
    },
  } as any;

  const router = buildWilRouter(routeContext);
  return { router, messageService, actionService };
}

beforeEach(() => {
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

describe('GET /wil/messages', () => {
  it('returns 200 with data and nextCursor', async () => {
    const items = [makeMessageRow({ id: 'msg-1', createdAt: new Date('2025-06-01T12:00:00.000Z') })];
    const { router, messageService } = createTestRouter({ message: { list: vi.fn().mockResolvedValue(items) } });

    const handlers = getRouteHandlers(router, 'get', '/messages');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty('data');
    expect(payload).toHaveProperty('nextCursor');
  });

  it('calls message service with resolved tenant project IDs', async () => {
    const { router, messageService } = createTestRouter();
    const handlers = getRouteHandlers(router, 'get', '/messages');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(messageService.list).toHaveBeenCalledWith(
      expect.objectContaining({ allowedProjectIds: ALLOWED_PROJECT_IDS }),
    );
  });

  it('passes actor matchers to service', async () => {
    const { router, messageService } = createTestRouter();
    const handlers = getRouteHandlers(router, 'get', '/messages');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(messageService.list).toHaveBeenCalledWith(
      expect.objectContaining({ actorMatchers: DEFAULT_ACTOR_MATCHERS }),
    );
  });

  it('calls service once with actor matchers (no fallback retry)', async () => {
    const listMock = vi.fn().mockResolvedValue([]);

    const { router } = createTestRouter({ message: { list: listMock } });
    const handlers = getRouteHandlers(router, 'get', '/messages');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('parses limit query parameter', async () => {
    const { router, messageService } = createTestRouter();
    const handlers = getRouteHandlers(router, 'get', '/messages');
    const req = createMockRequest({ query: { limit: '50' }, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(messageService.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it('parses since query parameter as time mode', async () => {
    const { router, messageService } = createTestRouter();
    const handlers = getRouteHandlers(router, 'get', '/messages');
    const req = createMockRequest({ query: { since: '2025-06-01T12:00:00.000Z' }, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(messageService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        since: { mode: 'time', since: new Date('2025-06-01T12:00:00.000Z') },
      }),
    );
  });

  it('parses since query parameter as cursor mode', async () => {
    const { router, messageService } = createTestRouter();
    const handlers = getRouteHandlers(router, 'get', '/messages');
    const req = createMockRequest({
      query: { since: '2025-06-01T12:00:00.000Z|msg-abc' },
      session: {} as any,
    });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(messageService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        since: { mode: 'cursor', createdAt: new Date('2025-06-01T12:00:00.000Z'), id: 'msg-abc' },
      }),
    );
  });

  it('forwards error to next when tenant resolution fails', async () => {
    const tenantError = new Error('tenant failure');
    resolveWilTenantProjectIdsMock.mockRejectedValue(tenantError);

    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'get', '/messages');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBe(tenantError);
  });

  it('forwards error to next when service throws', async () => {
    const serviceError = new Error('service failure');
    const listMock = vi.fn().mockRejectedValue(serviceError);

    const { router } = createTestRouter({ message: { list: listMock } });
    const handlers = getRouteHandlers(router, 'get', '/messages');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBe(serviceError);
  });
});

/* ================================================================== */
/*  GET /actions                                                       */
/* ================================================================== */

describe('GET /wil/actions', () => {
  it('returns 200 with data and nextCursor', async () => {
    const items = [makeActionRequestRow({ id: 'act-1', createdAt: new Date('2025-06-01T12:00:00.000Z') })];
    const { router, actionService } = createTestRouter({ action: { list: vi.fn().mockResolvedValue(items) } });

    const handlers = getRouteHandlers(router, 'get', '/actions');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty('data');
    expect(payload).toHaveProperty('nextCursor');
  });

  it('calls action service with resolved tenant project IDs', async () => {
    const { router, actionService } = createTestRouter();
    const handlers = getRouteHandlers(router, 'get', '/actions');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(actionService.list).toHaveBeenCalledWith(
      expect.objectContaining({ allowedProjectIds: ALLOWED_PROJECT_IDS }),
    );
  });

  it('passes actor matchers to service', async () => {
    const { router, actionService } = createTestRouter();
    const handlers = getRouteHandlers(router, 'get', '/actions');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(actionService.list).toHaveBeenCalledWith(expect.objectContaining({ actorMatchers: DEFAULT_ACTOR_MATCHERS }));
  });

  it('calls service once with actor matchers (no fallback retry)', async () => {
    const listMock = vi.fn().mockResolvedValue([]);

    const { router } = createTestRouter({ action: { list: listMock } });
    const handlers = getRouteHandlers(router, 'get', '/actions');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('parses limit query parameter', async () => {
    const { router, actionService } = createTestRouter();
    const handlers = getRouteHandlers(router, 'get', '/actions');
    const req = createMockRequest({ query: { limit: '100' }, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(actionService.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it('parses since query parameter', async () => {
    const { router, actionService } = createTestRouter();
    const handlers = getRouteHandlers(router, 'get', '/actions');
    const req = createMockRequest({
      query: { since: '2025-06-01T12:00:00.000Z|act-xyz' },
      session: {} as any,
    });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(actionService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        since: { mode: 'cursor', createdAt: new Date('2025-06-01T12:00:00.000Z'), id: 'act-xyz' },
      }),
    );
  });

  it('uses default limit when not specified', async () => {
    const { router, actionService } = createTestRouter();
    const handlers = getRouteHandlers(router, 'get', '/actions');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    await runHandlerChain(handlers!, req, res);

    expect(actionService.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  it('forwards error to next when tenant resolution fails', async () => {
    const tenantError = new Error('tenant failure');
    resolveWilTenantProjectIdsMock.mockRejectedValue(tenantError);

    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'get', '/actions');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBe(tenantError);
  });

  it('forwards error to next when service throws', async () => {
    const serviceError = new Error('service failure');
    const listMock = vi.fn().mockRejectedValue(serviceError);

    const { router } = createTestRouter({ action: { list: listMock } });
    const handlers = getRouteHandlers(router, 'get', '/actions');
    const req = createMockRequest({ query: {}, session: {} as any });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBe(serviceError);
  });
});
