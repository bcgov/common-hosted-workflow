/**
 * Unit tests for the message route handlers in
 * `src/api/workflow-interaction-layer/message.ts`.
 *
 * Strategy: instantiate the router via `createMessageRouter`, then invoke
 * each registered handler directly with mock req/res/next objects.
 * Middleware (auth, tenant) is stubbed as pass-through so we test only
 * the handler logic, schema validation, and repository interactions.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMessageRouter } from '../../../src/api/workflow-interaction-layer/message';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  createMockMessageRepository,
  createMockN8nRepositories,
  makeMessageRow,
  VALID_PROJECT_ID,
  VALID_WORKFLOW_ID,
  VALID_EXECUTION_ID,
  VALID_ACTOR_ID,
} from '../../helpers/mocks';

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Extracts route handlers from the Express Router stack.
 * Each entry has `route.path`, `route.methods`, and `route.stack[].handle`.
 */
function getRouteHandler(router: any, method: string, path: string) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
      // Return the last handler in the stack (the actual route handler after middleware)
      const handlers = layer.route.stack.map((s: any) => s.handle);
      return handlers;
    }
  }
  return null;
}

/**
 * Runs the full middleware chain for a route (validator + handler).
 * Stops at the first middleware that calls `next(error)`.
 */
async function runHandlerChain(handlers: Array<(req: any, res: any, next: any) => any>, req: any, res: any) {
  let error: unknown = null;
  for (const handler of handlers) {
    if (error) break;
    await new Promise<void>((resolve) => {
      const next = (err?: unknown) => {
        if (err) error = err;
        resolve();
      };
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function') {
        result
          .then(() => resolve())
          .catch((err: unknown) => {
            error = err;
            resolve();
          });
      }
    });
  }
  return error;
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

function createTestRouter() {
  const messageRepo = createMockMessageRepository();
  const n8nRepos = createMockN8nRepositories();

  const router = createMessageRouter({
    apiKeyAuthMiddleware: (_req: any, _res: any, next: any) => next(),
    workflowInteractionTenantMiddleware: (_req: any, _res: any, next: any) => next(),
    n8nRepositories: n8nRepos as any,
    customRepositories: {
      tenantProjectRelation: {} as any,
      message: messageRepo as any,
      actionRequest: {} as any,
    },
  });

  return { router, messageRepo, n8nRepos };
}

/* ================================================================== */
/*  GET /actors/:actorId/messages                                      */
/* ================================================================== */

describe('GET /actors/:actorId/messages', () => {
  it('returns 200 with messages for a valid request', async () => {
    const { router, messageRepo } = createTestRouter();
    const rows = [makeMessageRow(), makeMessageRow({ id: 'msg-002' })];
    messageRepo.list.mockResolvedValue(rows);

    const handlers = getRouteHandler(router, 'get', '/actors/:actorId/messages');
    expect(handlers).not.toBeNull();

    const req = createMockRequest({
      params: { actorId: VALID_ACTOR_ID },
      query: {},
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveLength(2);
  });

  it('passes workflowInstanceId filter to repository', async () => {
    const { router, messageRepo, n8nRepos } = createTestRouter();
    messageRepo.list.mockResolvedValue([]);

    const handlers = getRouteHandler(router, 'get', '/actors/:actorId/messages');
    const req = createMockRequest({
      params: { actorId: VALID_ACTOR_ID },
      query: { workflowInstanceId: VALID_EXECUTION_ID },
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(n8nRepos.execution.findSingleExecution).toHaveBeenCalled();
    expect(messageRepo.list).toHaveBeenCalledWith(expect.objectContaining({ workflowInstanceId: VALID_EXECUTION_ID }));
  });

  it('uses default limit of 50 when not specified', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.list.mockResolvedValue([]);

    const handlers = getRouteHandler(router, 'get', '/actors/:actorId/messages');
    const req = createMockRequest({
      params: { actorId: VALID_ACTOR_ID },
      query: {},
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(messageRepo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it('returns validation error for empty actorId', async () => {
    const { router } = createTestRouter();
    const handlers = getRouteHandler(router, 'get', '/actors/:actorId/messages');
    const req = createMockRequest({
      params: { actorId: '' },
      query: {},
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(400);
  });
});

/* ================================================================== */
/*  GET /messages/                                                     */
/* ================================================================== */

describe('GET /messages/', () => {
  it('returns 200 with items and nextCursor', async () => {
    const { router, messageRepo } = createTestRouter();
    const rows = [makeMessageRow()];
    messageRepo.list.mockResolvedValue(rows);

    const handlers = getRouteHandler(router, 'get', '/messages/');
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
    // Default limit is 50, so return exactly 50 items
    const rows = Array.from({ length: 50 }, (_, i) => makeMessageRow({ id: `msg-${String(i).padStart(3, '0')}` }));
    messageRepo.list.mockResolvedValue(rows);

    const handlers = getRouteHandler(router, 'get', '/messages/');
    const req = createMockRequest({ params: {}, query: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.nextCursor).not.toBeNull();
  });

  it('returns nextCursor as null when fewer items than limit', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.list.mockResolvedValue([makeMessageRow()]);

    const handlers = getRouteHandler(router, 'get', '/messages/');
    const req = createMockRequest({ params: {}, query: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.nextCursor).toBeNull();
  });

  it('filters by optional actorId query param', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.list.mockResolvedValue([]);

    const handlers = getRouteHandler(router, 'get', '/messages/');
    const req = createMockRequest({ params: {}, query: { actorId: 'specific-actor' } });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(messageRepo.list).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'specific-actor' }));
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
    const created = makeMessageRow();
    messageRepo.create.mockResolvedValue(created);

    const handlers = getRouteHandler(router, 'post', '/messages/');
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

    const handlers = getRouteHandler(router, 'post', '/messages/');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(messageRepo.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('defaults metadata to null when omitted', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.create.mockResolvedValue(makeMessageRow());

    const handlers = getRouteHandler(router, 'post', '/messages/');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(messageRepo.create).toHaveBeenCalledWith(expect.objectContaining({ metadata: null }));
  });

  it('returns validation error for missing required fields', async () => {
    const { router } = createTestRouter();
    const handlers = getRouteHandler(router, 'post', '/messages/');
    const req = createMockRequest({ params: {}, query: {}, body: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(400);
  });

  it('throws 500 when DB insert fails', async () => {
    const { router, messageRepo } = createTestRouter();
    messageRepo.create.mockRejectedValue(new Error('DB constraint violation'));

    const handlers = getRouteHandler(router, 'post', '/messages/');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(500);
  });
});
