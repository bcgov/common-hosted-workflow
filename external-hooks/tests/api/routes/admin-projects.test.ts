/**
 * Unit tests for the admin project-management write routes in
 * `src/api/routes/admin-projects.ts` (mounted under /ui-api/admin by the
 * parent router in ui-api.ts, behind the UI session + permission + role
 * guards). Shared read endpoints live in `routes/projects.ts` and are
 * covered by `tests/api/routes/projects.test.ts`.
 *
 * Strategy: build the sub-router with mocked services, then invoke each
 * route's handler chain (zod request parser + handler) directly through
 * the Express router stack. The auth/permission/role guards are mounted
 * by the parent router and are covered by the ui-api route tests.
 */
import { describe, expect, it, vi } from 'vitest';

import { buildAdminProjectRouter } from '../../../src/api/routes/admin-projects';
import { AppError } from '../../../src/api/utils/errors';
import {
  createMockRequest,
  createMockResponse,
  VALID_PROJECT_ID,
  VALID_TENANT_ID,
  VALID_TOPUP_ID,
} from '../../helpers/mocks';
import { expectNextAppError, getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';

const RATE_LIMIT_ROUTE = '/projects/:projectId/rate-limit';
const TOPUPS_ROUTE = '/projects/:projectId/topups';
const TOPUP_DELETE_ROUTE = '/projects/:projectId/topups/:topupId';
const DEFAULTS_ROUTE = '/projects/rate-limit-defaults';

function makeRateLimitBody(overrides: Record<string, unknown> = {}) {
  return {
    usesDefaultLimits: false,
    weeklyRateLimit: 100,
    yearlyRateLimit: 5000,
    lastAdminComment: 'Approved by the platform team',
    stopBehavior: 'hard_stop',
    ...overrides,
  };
}

function makeStoredRateLimit(overrides: Record<string, unknown> = {}) {
  return {
    projectId: VALID_PROJECT_ID,
    usesDefaultLimits: false,
    weeklyRateLimit: 100,
    yearlyRateLimit: 5000,
    lastAdminComment: 'Approved by the platform team',
    stopBehavior: 'hard_stop',
    updatedBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeTopupBody(overrides: Record<string, unknown> = {}) {
  return {
    periodKey: '2026-W45',
    amount: 2000,
    adminComment: '  Extra runs for the quarterly batch  ',
    ...overrides,
  };
}

function makeStoredTopup(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_TOPUP_ID,
    projectId: VALID_PROJECT_ID,
    periodKey: '2026-W45',
    amount: 2000,
    adminComment: 'Extra runs for the quarterly batch',
    createdBy: 'admin@example.com',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeSession(sessionOverrides: Record<string, unknown> = {}) {
  return {
    n8nUser: { email: 'admin@example.com', firstName: 'Admin', lastName: 'User' },
    ...sessionOverrides,
  } as any;
}

function createTestRouter(serviceOverrides: Record<string, any> = {}) {
  const projectTenant = {
    assignTenantToProject: vi.fn(),
    removeTenantFromProject: vi.fn(),
    ...serviceOverrides.projectTenant,
  };
  const projectRateLimit = {
    updateRateLimit: vi.fn(),
    createProjectTopup: vi.fn(),
    deleteProjectTopup: vi.fn(),
    getRateLimitDefaults: vi.fn(),
    updateRateLimitDefaults: vi.fn(),
    listRunRequestsForAdmin: vi.fn(),
    approveRunRequest: vi.fn(),
    denyRunRequest: vi.fn(),
    ...serviceOverrides.projectRateLimit,
  };

  const router = buildAdminProjectRouter({ services: { projectTenant, projectRateLimit } } as any);
  return { router, projectTenant, projectRateLimit };
}

/**
 * Runs the full handler chain (zod parser + route handler) like
 * `runHandlerChain`, but records every error handoff — `next(err)` with a
 * truthy error, or a rejected async handler — on the returned mock so
 * `expectNextAppError` can assert what reaches the central error
 * middleware. Successful `next()` continuations are not recorded.
 */
async function runHandlerChainCapturingErrors(
  handlers: Array<(req: any, res: any, next: any) => any>,
  req: any,
  res: any,
): Promise<ReturnType<typeof vi.fn>> {
  const next = vi.fn();
  let error: unknown = null;
  for (const handler of handlers) {
    if (error) break;
    await new Promise<void>((resolve) => {
      const wrappedNext = (err?: unknown) => {
        if (err) {
          error = err;
          next(err);
        }
        resolve();
      };
      const result = handler(req, res, wrappedNext);
      if (result && typeof result.then === 'function') {
        result
          .then(() => resolve())
          .catch((err: unknown) => {
            error = err;
            next(err);
            resolve();
          });
      }
    });
  }
  return next;
}

/* ================================================================== */
/*  PUT /projects/:projectId/rate-limit                                */
/* ================================================================== */

describe(`PUT /ui-api/admin${RATE_LIMIT_ROUTE}`, () => {
  it('updates the rate limit and responds with the stored row', async () => {
    const body = makeRateLimitBody();
    const stored = makeStoredRateLimit();
    const updateRateLimit = vi.fn().mockResolvedValue(stored);
    const { router } = createTestRouter({ projectRateLimit: { updateRateLimit } });

    const handlers = getRouteHandlers(router, 'put', RATE_LIMIT_ROUTE);
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID },
      body,
      query: {},
      session: makeSession(),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(updateRateLimit).toHaveBeenCalledWith(VALID_PROJECT_ID, body, 'admin@example.com');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Rate limit updated', rateLimit: stored });
  });

  it('passes null as the actor when the session has no n8n user', async () => {
    const body = makeRateLimitBody();
    const stored = makeStoredRateLimit();
    const updateRateLimit = vi.fn().mockResolvedValue(stored);
    const { router } = createTestRouter({ projectRateLimit: { updateRateLimit } });

    const handlers = getRouteHandlers(router, 'put', RATE_LIMIT_ROUTE);
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID },
      body,
      query: {},
      session: makeSession({ n8nUser: null }),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(updateRateLimit).toHaveBeenCalledWith(VALID_PROJECT_ID, body, null);
  });

  it('accepts explicit nulls that clear the limits and the admin comment', async () => {
    const body = {
      usesDefaultLimits: false,
      weeklyRateLimit: null,
      yearlyRateLimit: null,
      lastAdminComment: null,
      stopBehavior: 'soft_stop',
    };
    const stored = makeStoredRateLimit({
      usesDefaultLimits: false,
      weeklyRateLimit: null,
      yearlyRateLimit: null,
      lastAdminComment: null,
      stopBehavior: 'soft_stop',
    });
    const updateRateLimit = vi.fn().mockResolvedValue(stored);
    const { router } = createTestRouter({ projectRateLimit: { updateRateLimit } });

    const handlers = getRouteHandlers(router, 'put', RATE_LIMIT_ROUTE);
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID },
      body,
      query: {},
      session: makeSession(),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(updateRateLimit).toHaveBeenCalledWith(VALID_PROJECT_ID, body, 'admin@example.com');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Rate limit updated', rateLimit: stored });
  });

  it('propagates the service AppError 404 to the central error middleware', async () => {
    const updateRateLimit = vi.fn().mockRejectedValue(new AppError(404, 'Project not found'));
    const { router } = createTestRouter({ projectRateLimit: { updateRateLimit } });

    const handlers = getRouteHandlers(router, 'put', RATE_LIMIT_ROUTE);
    const req = createMockRequest({
      params: { projectId: 'missing-project' },
      body: makeRateLimitBody(),
      query: {},
      session: makeSession(),
    });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 404);
    expect(res.json).not.toHaveBeenCalled();
  });

  const invalidBodies: Array<[string, Record<string, unknown>]> = [
    ['a negative weeklyRateLimit', makeRateLimitBody({ weeklyRateLimit: -1 })],
    ['a non-integer weeklyRateLimit', makeRateLimitBody({ weeklyRateLimit: 12.5 })],
    ['an invalid stopBehavior', makeRateLimitBody({ stopBehavior: 'sometimes_stop' })],
    [
      'a missing stopBehavior',
      { usesDefaultLimits: false, weeklyRateLimit: 100, yearlyRateLimit: 5000, lastAdminComment: null },
    ],
    [
      'a missing usesDefaultLimits',
      { weeklyRateLimit: 100, yearlyRateLimit: 5000, lastAdminComment: null, stopBehavior: 'hard_stop' },
    ],
    ['a non-boolean usesDefaultLimits', makeRateLimitBody({ usesDefaultLimits: 'yes' })],
    ['an oversized lastAdminComment', makeRateLimitBody({ lastAdminComment: 'x'.repeat(2001) })],
  ];

  it.each(invalidBodies)('rejects %s with AppError 400 before reaching the service', async (_label, invalidBody) => {
    const updateRateLimit = vi.fn().mockResolvedValue(makeStoredRateLimit());
    const { router } = createTestRouter({ projectRateLimit: { updateRateLimit } });

    const handlers = getRouteHandlers(router, 'put', RATE_LIMIT_ROUTE);
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID },
      body: invalidBody,
      query: {},
      session: makeSession(),
    });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 400);
    expect(updateRateLimit).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  POST /projects/:projectId/topups                                   */
/* ================================================================== */

describe('POST /ui-api/admin/projects/:projectId/topups', () => {
  it('adds a top-up and responds with the stored row wrapped in a success envelope', async () => {
    const body = makeTopupBody();
    const stored = makeStoredTopup();
    const createProjectTopup = vi.fn().mockResolvedValue(stored);
    const { router } = createTestRouter({ projectRateLimit: { createProjectTopup } });

    const handlers = getRouteHandlers(router, 'post', TOPUPS_ROUTE);
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID },
      body,
      query: {},
      session: makeSession(),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    // The zod parser trims the comment before the service sees it.
    expect(createProjectTopup).toHaveBeenCalledWith(
      VALID_PROJECT_ID,
      { ...body, adminComment: 'Extra runs for the quarterly batch' },
      'admin@example.com',
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Top-up added', topup: stored });
  });

  it('passes null as the creator when the session has no n8n user', async () => {
    const createProjectTopup = vi.fn().mockResolvedValue(makeStoredTopup({ createdBy: null }));
    const { router } = createTestRouter({ projectRateLimit: { createProjectTopup } });

    const handlers = getRouteHandlers(router, 'post', TOPUPS_ROUTE);
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID },
      body: makeTopupBody(),
      query: {},
      session: makeSession({ n8nUser: null }),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    // The zod parser trims the comment before the service sees it.
    expect(createProjectTopup).toHaveBeenCalledWith(
      VALID_PROJECT_ID,
      { ...makeTopupBody(), adminComment: 'Extra runs for the quarterly batch' },
      null,
    );
  });

  it('propagates the service AppError 400 when the period is outside the top-up horizon', async () => {
    const createProjectTopup = vi
      .fn()
      .mockRejectedValue(
        new AppError(400, 'periodKey must be the current week or a coming week within the top-up horizon'),
      );
    const { router } = createTestRouter({ projectRateLimit: { createProjectTopup } });

    const handlers = getRouteHandlers(router, 'post', TOPUPS_ROUTE);
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID },
      body: makeTopupBody(),
      query: {},
      session: makeSession(),
    });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 400);
    expect(res.json).not.toHaveBeenCalled();
  });

  const invalidTopupBodies: Array<[string, Record<string, unknown>]> = [
    ['a malformed periodKey', makeTopupBody({ periodKey: '2026-10-27' })],
    ['a zero amount', makeTopupBody({ amount: 0 })],
    ['a negative amount', makeTopupBody({ amount: -100 })],
    ['a non-integer amount', makeTopupBody({ amount: 12.5 })],
    ['an oversized amount', makeTopupBody({ amount: 1_000_001 })],
    ['an empty adminComment', makeTopupBody({ adminComment: '' })],
    ['a whitespace-only adminComment', makeTopupBody({ adminComment: '   ' })],
    ['an oversized adminComment', makeTopupBody({ adminComment: 'x'.repeat(2001) })],
  ];

  it.each(invalidTopupBodies)(
    'rejects %s with AppError 400 before reaching the service',
    async (_label, invalidBody) => {
      const createProjectTopup = vi.fn().mockResolvedValue(makeStoredTopup());
      const { router } = createTestRouter({ projectRateLimit: { createProjectTopup } });

      const handlers = getRouteHandlers(router, 'post', TOPUPS_ROUTE);
      const req = createMockRequest({
        params: { projectId: VALID_PROJECT_ID },
        body: invalidBody,
        query: {},
        session: makeSession(),
      });
      const res = createMockResponse();

      const next = await runHandlerChainCapturingErrors(handlers!, req, res);

      expectNextAppError(next, 400);
      expect(createProjectTopup).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    },
  );
});

/* ================================================================== */
/*  DELETE /projects/:projectId/topups/:topupId                        */
/* ================================================================== */

describe('DELETE /ui-api/admin/projects/:projectId/topups/:topupId', () => {
  it('deletes a future-week top-up and responds 204 with no body', async () => {
    const deleteProjectTopup = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter({ projectRateLimit: { deleteProjectTopup } });

    const handlers = getRouteHandlers(router, 'delete', TOPUP_DELETE_ROUTE);
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID, topupId: VALID_TOPUP_ID },
      query: {},
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(deleteProjectTopup).toHaveBeenCalledWith(VALID_PROJECT_ID, VALID_TOPUP_ID);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID topupId with AppError 400 before reaching the service', async () => {
    const deleteProjectTopup = vi.fn().mockResolvedValue(undefined);
    const { router } = createTestRouter({ projectRateLimit: { deleteProjectTopup } });

    const handlers = getRouteHandlers(router, 'delete', TOPUP_DELETE_ROUTE);
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID, topupId: 'not-a-uuid' },
      query: {},
    });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 400);
    expect(deleteProjectTopup).not.toHaveBeenCalled();
  });

  it('propagates the service AppError 409 for a top-up whose week already started', async () => {
    const deleteProjectTopup = vi
      .fn()
      .mockRejectedValue(new AppError(409, 'Top-ups for the current or past weeks cannot be deleted'));
    const { router } = createTestRouter({ projectRateLimit: { deleteProjectTopup } });

    const handlers = getRouteHandlers(router, 'delete', TOPUP_DELETE_ROUTE);
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID, topupId: VALID_TOPUP_ID },
      query: {},
    });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 409);
    expect(res.json).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  GET /projects/rate-limit-defaults                                  */
/* ================================================================== */

describe(`GET /ui-api/admin${DEFAULTS_ROUTE}`, () => {
  it('returns the saved per-scope defaults without any usage counts', async () => {
    const defaults = {
      team: { weeklyRateLimit: 5000, yearlyRateLimit: 250000 },
      personal: { weeklyRateLimit: null, yearlyRateLimit: null },
    };
    const getRateLimitDefaults = vi.fn().mockResolvedValue(defaults);
    const { router } = createTestRouter({ projectRateLimit: { getRateLimitDefaults } });

    const handlers = getRouteHandlers(router, 'get', DEFAULTS_ROUTE);
    const req = createMockRequest({ query: {} });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(getRateLimitDefaults).toHaveBeenCalledWith();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(defaults);
  });

  it('propagates the service error when reading the defaults fails', async () => {
    const getRateLimitDefaults = vi.fn().mockRejectedValue(new AppError(500, 'Failed to read the rate-limit defaults'));
    const { router } = createTestRouter({ projectRateLimit: { getRateLimitDefaults } });

    const handlers = getRouteHandlers(router, 'get', DEFAULTS_ROUTE);
    const res = createMockResponse();
    const next = await runHandlerChainCapturingErrors(handlers!, createMockRequest({ query: {} }), res);

    expectNextAppError(next, 500);
    expect(res.json).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  PUT /projects/rate-limit-defaults                                  */
/* ================================================================== */

describe(`PUT /ui-api/admin${DEFAULTS_ROUTE}`, () => {
  function makeDefaultsBody(overrides: Record<string, unknown> = {}) {
    return {
      team: { weeklyRateLimit: 5000, yearlyRateLimit: 250000 },
      personal: { weeklyRateLimit: 2500, yearlyRateLimit: 100000 },
      ...overrides,
    };
  }

  it('saves both scopes with the acting admin email and responds with the saved values', async () => {
    const body = makeDefaultsBody();
    const updateRateLimitDefaults = vi.fn().mockResolvedValue(body);
    const { router } = createTestRouter({ projectRateLimit: { updateRateLimitDefaults } });

    const handlers = getRouteHandlers(router, 'put', DEFAULTS_ROUTE);
    const req = createMockRequest({ body, query: {}, session: makeSession() });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(updateRateLimitDefaults).toHaveBeenCalledWith(body, 'admin@example.com');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Default limits updated', defaults: body });
  });

  it('passes null as the actor when the session has no n8n user', async () => {
    const body = makeDefaultsBody();
    const updateRateLimitDefaults = vi.fn().mockResolvedValue(body);
    const { router } = createTestRouter({ projectRateLimit: { updateRateLimitDefaults } });

    const handlers = getRouteHandlers(router, 'put', DEFAULTS_ROUTE);
    const req = createMockRequest({ body, query: {}, session: makeSession({ n8nUser: null }) });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(updateRateLimitDefaults).toHaveBeenCalledWith(body, null);
  });

  it('rejects a scope whose yearly default is below its weekly default (400)', async () => {
    const body = makeDefaultsBody({ personal: { weeklyRateLimit: 100000, yearlyRateLimit: 5000 } });
    const updateRateLimitDefaults = vi.fn();
    const { router } = createTestRouter({ projectRateLimit: { updateRateLimitDefaults } });

    const handlers = getRouteHandlers(router, 'put', DEFAULTS_ROUTE);
    const req = createMockRequest({ body, query: {}, session: makeSession() });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 400);
    expect(updateRateLimitDefaults).not.toHaveBeenCalled();
  });

  it('rejects a missing scope (400)', async () => {
    const body = { team: { weeklyRateLimit: 5000, yearlyRateLimit: 250000 } };
    const updateRateLimitDefaults = vi.fn();
    const { router } = createTestRouter({ projectRateLimit: { updateRateLimitDefaults } });

    const handlers = getRouteHandlers(router, 'put', DEFAULTS_ROUTE);
    const req = createMockRequest({ body, query: {}, session: makeSession() });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 400);
    expect(updateRateLimitDefaults).not.toHaveBeenCalled();
  });

  it('rejects negative defaults (400)', async () => {
    const body = makeDefaultsBody({ team: { weeklyRateLimit: -1, yearlyRateLimit: 250000 } });
    const updateRateLimitDefaults = vi.fn();
    const { router } = createTestRouter({ projectRateLimit: { updateRateLimitDefaults } });

    const handlers = getRouteHandlers(router, 'put', DEFAULTS_ROUTE);
    const req = createMockRequest({ body, query: {}, session: makeSession() });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 400);
    expect(updateRateLimitDefaults).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  Admin run-request review routes                                    */
/* ================================================================== */

const RUN_REQUESTS_ROUTE = '/projects/run-requests';
const RUN_REQUEST_APPROVE_ROUTE = '/projects/run-requests/:requestId/approve';
const RUN_REQUEST_DENY_ROUTE = '/projects/run-requests/:requestId/deny';
const VALID_RUN_REQUEST_ID = '22222222-2222-4222-8222-222222222222';

function makeRunRequestItem(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_RUN_REQUEST_ID,
    projectId: VALID_PROJECT_ID,
    projectName: 'Default project',
    projectType: 'personal',
    requestKind: 'extra_runs',
    status: 'pending',
    extraRuns: 5000,
    periodKey: '2026-W47',
    requestedWeeklyLimit: null,
    requestedAnnualLimit: null,
    reason: 'Fall intake started early',
    requestedBy: 'requester-1',
    requestedByName: 'Jordan Lee',
    requestedByEmail: 'jordan.lee@example.com',
    requestedByRoleLabel: 'Editor',
    createdAt: '2026-11-10T10:14:00.000Z',
    weeklyUsedWhenSent: 0,
    yearlyUsedWhenSent: 0,
    weeklyUsedNow: 0,
    yearlyUsedNow: 0,
    currentWeeklyLimit: null,
    currentAnnualLimit: null,
    lastTopup: null,
    lastLimitChange: null,
    grantedRuns: null,
    decidedWeeklyLimit: null,
    decidedAnnualLimit: null,
    decisionNote: null,
    decidedBy: null,
    decidedByName: null,
    decidedAt: null,
    ...overrides,
  };
}

describe(`GET /ui-api/admin${RUN_REQUESTS_ROUTE}`, () => {
  it('lists run requests with the parser defaults (pending, page 1, pageSize 25)', async () => {
    const result = {
      data: [makeRunRequestItem()],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      pending: { count: 1, oldestCreatedAt: '2026-11-10T10:14:00.000Z' },
    };
    const listRunRequestsForAdmin = vi.fn().mockResolvedValue(result);
    const { router } = createTestRouter({ projectRateLimit: { listRunRequestsForAdmin } });

    const handlers = getRouteHandlers(router, 'get', RUN_REQUESTS_ROUTE);
    const req = createMockRequest({ query: {}, session: makeSession() });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(listRunRequestsForAdmin).toHaveBeenCalledWith({
      status: 'pending',
      search: undefined,
      page: 1,
      pageSize: 25,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('passes the status, search and paging query through with coercion', async () => {
    const listRunRequestsForAdmin = vi.fn().mockResolvedValue({ data: [], pagination: {}, pending: {} });
    const { router } = createTestRouter({ projectRateLimit: { listRunRequestsForAdmin } });

    const handlers = getRouteHandlers(router, 'get', RUN_REQUESTS_ROUTE);
    const req = createMockRequest({
      query: { status: 'all', search: 'devx', page: '2', pageSize: '10' },
      session: makeSession(),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(listRunRequestsForAdmin).toHaveBeenCalledWith({ status: 'all', search: 'devx', page: 2, pageSize: 10 });
  });

  it('rejects an unknown status filter (400)', async () => {
    const listRunRequestsForAdmin = vi.fn();
    const { router } = createTestRouter({ projectRateLimit: { listRunRequestsForAdmin } });

    const handlers = getRouteHandlers(router, 'get', RUN_REQUESTS_ROUTE);
    const req = createMockRequest({ query: { status: 'maybe' }, session: makeSession() });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 400);
    expect(listRunRequestsForAdmin).not.toHaveBeenCalled();
  });
});

describe(`POST /ui-api/admin${RUN_REQUEST_APPROVE_ROUTE}`, () => {
  it('approves a request and responds with the decided row', async () => {
    const decided = makeRunRequestItem({ status: 'approved', grantedRuns: 3000, decidedBy: 'admin@example.com' });
    const approveRunRequest = vi.fn().mockResolvedValue(decided);
    const { router } = createTestRouter({ projectRateLimit: { approveRunRequest } });

    const handlers = getRouteHandlers(router, 'post', RUN_REQUEST_APPROVE_ROUTE);
    const req = createMockRequest({
      params: { requestId: VALID_RUN_REQUEST_ID },
      body: { grantedRuns: 3000, note: 'Partial for now' },
      query: {},
      session: makeSession(),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(approveRunRequest).toHaveBeenCalledWith(
      VALID_RUN_REQUEST_ID,
      { grantedRuns: 3000, note: 'Partial for now' },
      'admin@example.com',
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Request approved', request: decided });
  });

  it('passes null as the decider when the session has no n8n user', async () => {
    const approveRunRequest = vi.fn().mockResolvedValue(makeRunRequestItem());
    const { router } = createTestRouter({ projectRateLimit: { approveRunRequest } });

    const handlers = getRouteHandlers(router, 'post', RUN_REQUEST_APPROVE_ROUTE);
    const req = createMockRequest({
      params: { requestId: VALID_RUN_REQUEST_ID },
      body: {},
      query: {},
      session: makeSession({ n8nUser: null }),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(approveRunRequest).toHaveBeenCalledWith(VALID_RUN_REQUEST_ID, {}, null);
  });

  it('rejects grants below the minimum (400)', async () => {
    const approveRunRequest = vi.fn();
    const { router } = createTestRouter({ projectRateLimit: { approveRunRequest } });

    const handlers = getRouteHandlers(router, 'post', RUN_REQUEST_APPROVE_ROUTE);
    const req = createMockRequest({
      params: { requestId: VALID_RUN_REQUEST_ID },
      body: { grantedRuns: 50 },
      query: {},
      session: makeSession(),
    });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 400);
    expect(approveRunRequest).not.toHaveBeenCalled();
  });

  it('propagates service errors (409 already decided)', async () => {
    const approveRunRequest = vi.fn().mockRejectedValue(new AppError(409, 'This request has already been decided'));
    const { router } = createTestRouter({ projectRateLimit: { approveRunRequest } });

    const handlers = getRouteHandlers(router, 'post', RUN_REQUEST_APPROVE_ROUTE);
    const req = createMockRequest({
      params: { requestId: VALID_RUN_REQUEST_ID },
      body: {},
      query: {},
      session: makeSession(),
    });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 409);
  });
});

describe(`POST /ui-api/admin${RUN_REQUEST_DENY_ROUTE}`, () => {
  it('denies a request with the reason and responds with the rejected row', async () => {
    const reason = 'Not enough platform quota this quarter. Please ask again in January.';
    const rejected = makeRunRequestItem({ status: 'denied', decisionNote: reason });
    const denyRunRequest = vi.fn().mockResolvedValue(rejected);
    const { router } = createTestRouter({ projectRateLimit: { denyRunRequest } });

    const handlers = getRouteHandlers(router, 'post', RUN_REQUEST_DENY_ROUTE);
    const req = createMockRequest({
      params: { requestId: VALID_RUN_REQUEST_ID },
      body: { reason },
      query: {},
      session: makeSession(),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(denyRunRequest).toHaveBeenCalledWith(VALID_RUN_REQUEST_ID, { reason }, 'admin@example.com');
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Request denied', request: rejected });
  });

  it('rejects a too-short reason (400)', async () => {
    const denyRunRequest = vi.fn();
    const { router } = createTestRouter({ projectRateLimit: { denyRunRequest } });

    const handlers = getRouteHandlers(router, 'post', RUN_REQUEST_DENY_ROUTE);
    const req = createMockRequest({
      params: { requestId: VALID_RUN_REQUEST_ID },
      body: { reason: 'too short' },
      query: {},
      session: makeSession(),
    });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 400);
    expect(denyRunRequest).not.toHaveBeenCalled();
  });
});
