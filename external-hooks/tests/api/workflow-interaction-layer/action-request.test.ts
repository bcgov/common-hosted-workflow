/**
 * Unit tests for the action-request route handlers in
 * `src/api/routes/actions.ts`.
 *
 * Same strategy as message.test.ts: instantiate the router, extract
 * handlers from the Express stack, and run them with mock objects.
 */
import { describe, expect, it } from 'vitest';
import { buildActionRouter } from '../../../src/api/routes/actions';
import {
  createMockRequest,
  createMockResponse,
  createMockActionRequestRepository,
  createMockMessageRepository,
  createMockN8nRepositories,
  createMockActionService,
  createMockMessageService,
  createMockRouteContext,
  makeActionRequestRow,
  VALID_PROJECT_ID,
  VALID_WORKFLOW_ID,
  VALID_EXECUTION_ID,
  VALID_ACTOR_ID,
  VALID_ACTION_ID,
} from '../../helpers/mocks';
import { getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

function createTestRouter() {
  const actionRequestRepo = createMockActionRequestRepository();
  const messageRepo = createMockMessageRepository();
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
      featureFlag: {} as any,
      tenant: {} as any,
      tenantProjectSync: {} as any,
      projectTenant: {} as any,
      claim: {} as any,
      trigger: {} as any,
    },
  });
  const router = buildActionRouter(routeContext);

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

    const handlers = getRouteHandlers(router, 'post', '/actions');
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

    const handlers = getRouteHandlers(router, 'post', '/actions');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(actionRequestRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', priority: 'normal', callbackMethod: 'POST' }),
    );
  });

  it('passes dueDate and checkIn as null when not provided', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.create.mockResolvedValue(makeActionRequestRow());

    const handlers = getRouteHandlers(router, 'post', '/actions');
    const req = createMockRequest({ params: {}, query: {}, body: validBody });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(actionRequestRepo.create).toHaveBeenCalledWith(expect.objectContaining({ dueDate: null, checkIn: null }));
  });

  it('returns validation error for missing required fields', async () => {
    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'post', '/actions');
    const req = createMockRequest({ params: {}, query: {}, body: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(400);
  });

  it('throws 500 when DB insert fails', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.create.mockRejectedValue(new Error('DB error'));

    const handlers = getRouteHandlers(router, 'post', '/actions');
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

    const handlers = getRouteHandlers(router, 'get', '/actions');
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

    const handlers = getRouteHandlers(router, 'get', '/actions');
    const req = createMockRequest({ params: {}, query: { actorId: 'specific-actor' } });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(actionRequestRepo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
    const callArg = actionRequestRepo.list.mock.calls[0][0];
    expect(callArg.where).toBeInstanceOf(Array);
    expect(callArg.where.length).toBeGreaterThanOrEqual(2);
  });

  it('uses default limit of 50', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.list.mockResolvedValue([]);

    const handlers = getRouteHandlers(router, 'get', '/actions');
    const req = createMockRequest({ params: {}, query: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(actionRequestRepo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
  });

  it('validates execution in tenant scope when workflowInstanceId provided', async () => {
    const { router, n8nRepos } = createTestRouter();

    const handlers = getRouteHandlers(router, 'get', '/actions');
    const req = createMockRequest({ params: {}, query: { workflowInstanceId: VALID_EXECUTION_ID } });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    expect(n8nRepos.execution.loadMetadataOrNull).toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  GET /actions/:actionId                                             */
/* ================================================================== */

describe('GET /actions/:actionId', () => {
  it('returns 200 with single action', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.getById.mockResolvedValue(makeActionRequestRow());

    const handlers = getRouteHandlers(router, 'get', '/actions/:actionId');
    const req = createMockRequest({ params: { actionId: VALID_ACTION_ID }, query: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('throws 404 when action not found', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.getById.mockResolvedValue(null);

    const handlers = getRouteHandlers(router, 'get', '/actions/:actionId');
    const req = createMockRequest({ params: { actionId: 'missing' }, query: {} });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(404);
  });
});

/* ================================================================== */
/*  PATCH /actions/:actionId                                           */
/* ================================================================== */

describe('PATCH /actions/:actionId', () => {
  it('returns 200 with updated status', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.directUpdate.mockResolvedValue(makeActionRequestRow({ status: 'completed' }));

    const handlers = getRouteHandlers(router, 'patch', '/actions/:actionId');
    const req = createMockRequest({ params: { actionId: VALID_ACTION_ID }, query: {}, body: { status: 'completed' } });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.status).toBe('completed');
    expect(payload.id).toBe(VALID_ACTION_ID);
  });

  it('throws 404 when action not found', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.directUpdate.mockResolvedValue(null);

    const handlers = getRouteHandlers(router, 'patch', '/actions/:actionId');
    const req = createMockRequest({ params: { actionId: 'missing' }, query: {}, body: { status: 'completed' } });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(404);
  });

  it('returns full action response with "deleted" status', async () => {
    const { router, actionRequestRepo } = createTestRouter();
    actionRequestRepo.directUpdate.mockResolvedValue(makeActionRequestRow({ status: 'deleted' }));

    const handlers = getRouteHandlers(router, 'patch', '/actions/:actionId');
    const req = createMockRequest({ params: { actionId: VALID_ACTION_ID }, query: {}, body: { status: 'deleted' } });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    await runHandlerChain(handlers!, req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.status).toBe('deleted');
    expect(payload.id).toBe(VALID_ACTION_ID);
  });

  it('returns validation error for invalid status', async () => {
    const { router } = createTestRouter();
    const handlers = getRouteHandlers(router, 'patch', '/actions/:actionId');
    const req = createMockRequest({ params: { actionId: VALID_ACTION_ID }, query: {}, body: { status: 'invalid' } });
    const res = createMockResponse({ chwfAllowedProjectIds: [VALID_PROJECT_ID] });

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeDefined();
    expect((error as any).statusCode).toBe(400);
  });
});
