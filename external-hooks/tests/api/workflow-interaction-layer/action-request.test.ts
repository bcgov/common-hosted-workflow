/**
 * Unit tests for the action-request route handlers in
 * `src/api/workflow-interaction-layer/action-request.ts`.
 *
 * Same strategy as message.test.ts: instantiate the router, extract
 * handlers from the Express stack, and run them with mock objects.
 */
import { describe, expect, it, vi } from 'vitest';
import { createActionRequestRouter } from '../../../src/api/workflow-interaction-layer/action-request';
import {
  createMockRequest,
  createMockResponse,
  createMockActionRequestRepository,
  createMockN8nRepositories,
  makeActionRequestRow,
  VALID_PROJECT_ID,
  VALID_WORKFLOW_ID,
  VALID_EXECUTION_ID,
  VALID_ACTOR_ID,
  VALID_ACTION_ID,
} from '../../helpers/mocks';

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

function getRouteHandler(router: any, method: string, path: string) {
  for (const layer of router.stack) {
    if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
      return layer.route.stack.map((s: any) => s.handle);
    }
  }
  return null;
}

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
  const actionRequestRepo = createMockActionRequestRepository();
  const n8nRepos = createMockN8nRepositories();

  const router = createActionRequestRouter({
    apiKeyAuthMiddleware: (_req: any, _res: any, next: any) => next(),
    workflowInteractionTenantMiddleware: (_req: any, _res: any, next: any) => next(),
    n8nRepositories: n8nRepos as any,
    customRepositories: {
      tenantProjectRelation: {} as any,
      message: {} as any,
      actionRequest: actionRequestRepo as any,
    },
  });

  return { router, actionRequestRepo, n8nRepos };
}

/* ================================================================== */
/*  POST /actions                                                      */
/* ================================================================== */

describe('POST /actions', () => {
  const validBody = {
    actionType: 'approval',
    payload: { key: 'value' },
    callbackUrl: 'https://example.com/cb',
    actorId: VALID_ACTOR_ID,
    actorType: 'user',
    workflowInstanceId: VALID_EXECUTION_ID,
    workflowId: VALID_WORKFLOW_ID,
  };

  it('returns 201 with created action on valid input', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.create.mockResolvedValue(makeActionRequestRow());

    const handlers = getRouteHandler(router, 'post', '/actions');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalled();
  });

  it('defaults status to "pending", priority to "normal", callbackMethod to "POST"', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.create.mockResolvedValue(makeActionRequestRow());

    const handlers = getRouteHandler(router, 'post', '/actions');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(actionRequestRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        priority: 'normal',
        callbackMethod: 'POST',
      }),
    );
  });

  it('passes dueDate and checkIn as null when not provided', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.create.mockResolvedValue(makeActionRequestRow());

    const handlers = getRouteHandler(router, 'post', '/actions');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(actionRequestRepo.create).toHaveBeenCalledWith(expect.objectContaining({ dueDate: null, checkIn: null }));
  });

  it('returns validation error for missing required fields', async () => {
    const { router } = createTestRouter();
    const handlers = getRouteHandler(router, 'post', '/actions');
    const req = createMockRequest({ params: {}, query: {}, body: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(400);
  });

  it('throws 500 when DB insert fails', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.create.mockRejectedValue(new Error('DB error'));

    const handlers = getRouteHandler(router, 'post', '/actions');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(500);
  });
});

/* ================================================================== */
/*  GET /actions                                                       */
/* ================================================================== */

describe('GET /actions', () => {
  it('returns 200 with items and nextCursor', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.list.mockResolvedValue([makeActionRequestRow()]);

    const handlers = getRouteHandler(router, 'get', '/actions');
    const req = createMockRequest({ params: {}, query: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty('items');
    expect(payload).toHaveProperty('nextCursor');
  });

  it('filters by actorId when provided', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.list.mockResolvedValue([]);

    const handlers = getRouteHandler(router, 'get', '/actions');
    const req = createMockRequest({ params: {}, query: { actorId: 'specific-actor' } });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(actionRequestRepo.list).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'specific-actor' }));
  });

  it('uses default limit of 50', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.list.mockResolvedValue([]);

    const handlers = getRouteHandler(router, 'get', '/actions');
    const req = createMockRequest({ params: {}, query: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(actionRequestRepo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it('validates execution in tenant scope when workflowInstanceId provided', async () => {
    const { router, n8nRepos } = createTestRouter();

    const handlers = getRouteHandler(router, 'get', '/actions');
    const req = createMockRequest({
      params: {},
      query: { workflowInstanceId: VALID_EXECUTION_ID },
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(n8nRepos.execution.findSingleExecution).toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  GET /actions/:actionId                                             */
/* ================================================================== */

describe('GET /actions/:actionId', () => {
  it('returns 200 with single action', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.getById.mockResolvedValue(makeActionRequestRow());

    const handlers = getRouteHandler(router, 'get', '/actions/:actionId');
    const req = createMockRequest({ params: { actionId: VALID_ACTION_ID }, query: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('throws 404 when action not found', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.getById.mockResolvedValue(null);

    const handlers = getRouteHandler(router, 'get', '/actions/:actionId');
    const req = createMockRequest({ params: { actionId: 'missing' }, query: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(404);
  });
});

/* ================================================================== */
/*  GET /actors/:actorId/actions/:actionId                             */
/* ================================================================== */

describe('GET /actors/:actorId/actions/:actionId', () => {
  it('returns 200 scoped to actor', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.getById.mockResolvedValue(makeActionRequestRow());

    const handlers = getRouteHandler(router, 'get', '/actors/:actorId/actions/:actionId');
    const req = createMockRequest({
      params: { actorId: VALID_ACTOR_ID, actionId: VALID_ACTION_ID },
      query: {},
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(actionRequestRepo.getById).toHaveBeenCalledWith(expect.objectContaining({ actorId: VALID_ACTOR_ID }));
  });

  it('throws 404 when not found for that actor', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.getById.mockResolvedValue(null);

    const handlers = getRouteHandler(router, 'get', '/actors/:actorId/actions/:actionId');
    const req = createMockRequest({
      params: { actorId: 'other-actor', actionId: VALID_ACTION_ID },
      query: {},
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(404);
  });
});

/* ================================================================== */
/*  GET /actors/:actorId/actions                                       */
/* ================================================================== */

describe('GET /actors/:actorId/actions', () => {
  it('returns 200 with paginated list scoped to actor', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.list.mockResolvedValue([makeActionRequestRow()]);

    const handlers = getRouteHandler(router, 'get', '/actors/:actorId/actions');
    const req = createMockRequest({
      params: { actorId: VALID_ACTOR_ID },
      query: {},
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty('items');
    expect(payload).toHaveProperty('nextCursor');
  });

  it('passes actorId from params to repository', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.list.mockResolvedValue([]);

    const handlers = getRouteHandler(router, 'get', '/actors/:actorId/actions');
    const req = createMockRequest({
      params: { actorId: VALID_ACTOR_ID },
      query: {},
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(actionRequestRepo.list).toHaveBeenCalledWith(expect.objectContaining({ actorId: VALID_ACTOR_ID }));
  });
});

/* ================================================================== */
/*  PATCH /actions/:actionId                                           */
/* ================================================================== */

describe('PATCH /actions/:actionId', () => {
  it('returns 200 with updated status', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.updateStatus.mockResolvedValue(true);

    const handlers = getRouteHandler(router, 'patch', '/actions/:actionId');
    const req = createMockRequest({
      params: { actionId: VALID_ACTION_ID },
      query: {},
      body: { status: 'completed' },
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.status).toBe('completed');
    expect(payload.message).toContain('completed');
  });

  it('throws 404 when action not found', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.updateStatus.mockResolvedValue(false);

    const handlers = getRouteHandler(router, 'patch', '/actions/:actionId');
    const req = createMockRequest({
      params: { actionId: 'missing' },
      query: {},
      body: { status: 'completed' },
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(404);
  });

  it('formats "deleted" status message correctly', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.updateStatus.mockResolvedValue(true);

    const handlers = getRouteHandler(router, 'patch', '/actions/:actionId');
    const req = createMockRequest({
      params: { actionId: VALID_ACTION_ID },
      query: {},
      body: { status: 'deleted' },
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.message).toBe('The action has been deleted.');
  });

  it('returns validation error for invalid status', async () => {
    const { router } = createTestRouter();
    const handlers = getRouteHandler(router, 'patch', '/actions/:actionId');
    const req = createMockRequest({
      params: { actionId: VALID_ACTION_ID },
      query: {},
      body: { status: 'invalid' },
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(400);
  });
});

/* ================================================================== */
/*  PATCH /actors/:actorId/actions/:actionId                           */
/* ================================================================== */

describe('PATCH /actors/:actorId/actions/:actionId', () => {
  it('returns 200 scoped to actor', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.updateStatus.mockResolvedValue(true);

    const handlers = getRouteHandler(router, 'patch', '/actors/:actorId/actions/:actionId');
    const req = createMockRequest({
      params: { actorId: VALID_ACTOR_ID, actionId: VALID_ACTION_ID },
      query: {},
      body: { status: 'completed' },
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(actionRequestRepo.updateStatus).toHaveBeenCalledWith(expect.objectContaining({ actorId: VALID_ACTOR_ID }));
  });

  it('throws 404 when not found for that actor', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.updateStatus.mockResolvedValue(false);

    const handlers = getRouteHandler(router, 'patch', '/actors/:actorId/actions/:actionId');
    const req = createMockRequest({
      params: { actorId: 'other-actor', actionId: VALID_ACTION_ID },
      query: {},
      body: { status: 'completed' },
    });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(404);
  });
});
