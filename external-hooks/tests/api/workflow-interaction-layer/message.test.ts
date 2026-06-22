/**
 * Unit tests for the message route handlers in
 * `src/api/routes/messages.ts`.
 *
 * Strategy: register the routes on an Express router, then invoke
 * each registered handler directly with mock req/res/next objects.
 * Middleware (auth, tenant) is stubbed as pass-through so we test only
 * the handler logic, schema validation, and repository interactions.
 */
import { describe, expect, it } from 'vitest';
import { buildMessageRouter } from '../../../src/api/routes/messages';
import {
  createMockRequest,
  createMockResponse,
  createMockMessageRepository,
  createMockActionRequestRepository,
  createMockN8nRepositories,
  createMockMessageService,
  createMockActionService,
  createMockRouteContext,
  makeMessageRow,
  VALID_PROJECT_ID,
  VALID_WORKFLOW_ID,
  VALID_EXECUTION_ID,
  VALID_ACTOR_ID,
} from '../../helpers/mocks';
import { getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

function createTestRouter() {
  const messageRepo = createMockMessageRepository();
  const actionRequestRepo = createMockActionRequestRepository();
  const n8nRepos = createMockN8nRepositories();
  const routeContext = createMockRouteContext({
    n8nRepositories: { raw: n8nRepos } as any,
    customRepositories: {
      tenantProjectRelation: {} as any,
      message: messageRepo as any,
      actionRequest: actionRequestRepo as any,
    } as any,
    services: {
      uiApi: {} as any,
      action: createMockActionService(actionRequestRepo, n8nRepos),
      message: createMockMessageService(messageRepo, n8nRepos),
      accessRequest: {} as any,
      chefs: {} as any,
      cstar: {} as any,
      tenant: {} as any,
      tenantProjectSync: {} as any,
    },
  });
  const router = buildMessageRouter(routeContext);

  return { router, messageRepo, n8nRepos };
}

/* ================================================================== */
/*  GET /messages/                                                     */
/* ================================================================== */

describe('GET /messages/', () => {
  it('returns 200 with items and nextCursor', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.list.mockResolvedValue([makeMessageRow()]);

    const handlers = getRouteHandlers(router, 'get', '/messages/');
    const req = createMockRequest({ params: {}, query: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty('items');
    expect(payload).toHaveProperty('nextCursor');
  });

  it('returns nextCursor when items.length equals pageLimit', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.list.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => makeMessageRow({ id: `msg-${String(i).padStart(3, '0')}` })),
    );

    const handlers = getRouteHandlers(router, 'get', '/messages/');
    const req = createMockRequest({ params: {}, query: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(res.json.mock.calls[0][0].nextCursor).not.toBeNull();
  });

  it('returns nextCursor as null when fewer items than limit', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.list.mockResolvedValue([makeMessageRow()]);

    const handlers = getRouteHandlers(router, 'get', '/messages/');
    const req = createMockRequest({ params: {}, query: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(res.json.mock.calls[0][0].nextCursor).toBeNull();
  });

  it('filters by optional actorId query param', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.list.mockResolvedValue([]);

    const handlers = getRouteHandlers(router, 'get', '/messages/');
    const req = createMockRequest({ params: {}, query: { actorId: 'specific-actor' } });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(messageRepo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
    const callArg = messageRepo.list.mock.calls[0][0];
    expect(callArg.where).toBeInstanceOf(Array);
    expect(callArg.where.length).toBeGreaterThanOrEqual(2);
  });
});

/* ================================================================== */
/*  POST /messages/                                                    */
/* ================================================================== */

describe('POST /messages/', () => {
  const validBody = {
    title: 'Alert',
    body: 'Something happened',
    actorId: VALID_ACTOR_ID,
    actorType: 'user',
    workflowInstanceId: VALID_EXECUTION_ID,
    workflowId: VALID_WORKFLOW_ID,
  };

  it('returns 201 with created message on valid input', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.create.mockResolvedValue(makeMessageRow());

    const handlers = getRouteHandlers(router, 'post', '/messages/');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalled();
  });

  it('defaults status to "active" when omitted', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.create.mockResolvedValue(makeMessageRow());

    const handlers = getRouteHandlers(router, 'post', '/messages/');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(messageRepo.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('defaults metadata to null when omitted', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.create.mockResolvedValue(makeMessageRow());

    const handlers = getRouteHandlers(router, 'post', '/messages/');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(messageRepo.create).toHaveBeenCalledWith(expect.objectContaining({ metadata: null }));
  });

  it('returns validation error for missing required fields', async () => {
    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'post', '/messages/');
    const req = createMockRequest({ params: {}, query: {}, body: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(400);
  });

  it('throws 500 when DB insert fails', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.create.mockRejectedValue(new Error('DB constraint violation'));

    const handlers = getRouteHandlers(router, 'post', '/messages/');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(500);
  });
});
