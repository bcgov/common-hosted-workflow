/**
 * Unit tests for the actor-prefixed route handlers in
 * `src/api/routes/actors.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildActorRouter } from '../../../src/api/routes/actors';
import type { ApiRouteContext } from '../../../src/api/types/routes';
import {
  createMockRequest,
  createMockResponse,
  createMockActionRequestRepository,
  createMockMessageRepository,
  createMockN8nRepositories,
  makeActionRequestRow,
  makeMessageRow,
  VALID_PROJECT_ID,
  VALID_EXECUTION_ID,
  VALID_ACTOR_ID,
  VALID_ACTION_ID,
} from '../../helpers/mocks';

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

function createTestRouter() {
  const messageRepo = createMockMessageRepository();
  const actionRequestRepo = createMockActionRequestRepository();
  const n8nRepos = createMockN8nRepositories();
  const routeContext: ApiRouteContext = {
    apiKeyAuthMiddleware: (_req: any, _res: any, next: any) => next(),
    adminAuthMiddleware: (_req: any, _res: any, next: any) => next(),
    workflowInteractionTenantMiddleware: (_req: any, _res: any, next: any) => next(),
    n8nRepositories: n8nRepos as any,
    customRepositories: {
      tenantProjectRelation: {} as any,
      message: messageRepo as any,
      actionRequest: actionRequestRepo as any,
    },
  };

  const router = buildActorRouter(routeContext);

  return { router, messageRepo, actionRequestRepo, n8nRepos };
}

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
