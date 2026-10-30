/**
 * Unit tests for the admin project-management routes in
 * `src/api/routes/admin-projects.ts` (mounted under /ui-api/admin by the
 * parent router in ui-api.ts, behind the UI session + permission + role
 * guards).
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
    listAllProjectsWithTenants: vi.fn(),
    assignTenantToProject: vi.fn(),
    removeTenantFromProject: vi.fn(),
    getAdminProjectById: vi.fn(),
    ...serviceOverrides.projectTenant,
  };
  const projectRateLimit = {
    updateRateLimit: vi.fn(),
    getProjectWorkflowUsage: vi.fn(),
    listProjectTopups: vi.fn(),
    createProjectTopup: vi.fn(),
    deleteProjectTopup: vi.fn(),
    getRateLimitDefaults: vi.fn(),
    updateRateLimitDefaults: vi.fn(),
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
/*  GET /projects                                                      */
/* ================================================================== */

describe('GET /ui-api/admin/projects', () => {
  it('returns the enriched projects page with rate-limit fields for configured and unconfigured projects', async () => {
    const page = {
      data: [
        {
          projectId: VALID_PROJECT_ID,
          projectName: 'Configured project',
          projectType: 'team',
          tenantId: VALID_TENANT_ID,
          weeklyRateLimit: 10,
          yearlyRateLimit: 1000,
          stopBehavior: 'hard_stop',
          lastAdminComment: 'Cap for FY',
          weeklyExecutionCount: 3,
          yearlyExecutionCount: 30,
          workflowCount: 5,
        },
        {
          projectId: 'proj-002',
          projectName: 'Unconfigured project',
          projectType: 'personal',
          tenantId: null,
          weeklyRateLimit: null,
          yearlyRateLimit: null,
          stopBehavior: null,
          lastAdminComment: null,
          weeklyExecutionCount: 0,
          yearlyExecutionCount: 0,
          workflowCount: 0,
        },
      ],
      pagination: { page: 1, pageSize: 25, totalItems: 2, totalPages: 1 },
    };
    const listAllProjectsWithTenants = vi.fn().mockResolvedValue(page);
    const { router } = createTestRouter({ projectTenant: { listAllProjectsWithTenants } });

    const handlers = getRouteHandlers(router, 'get', '/projects');
    const req = createMockRequest({ query: {} });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(listAllProjectsWithTenants).toHaveBeenCalledWith(1, 25, { search: undefined, type: undefined });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(page);

    const [payload] = res.json.mock.calls[0];
    expect(payload.data[0]).toEqual(
      expect.objectContaining({
        weeklyRateLimit: 10,
        yearlyRateLimit: 1000,
        stopBehavior: 'hard_stop',
        lastAdminComment: 'Cap for FY',
        weeklyExecutionCount: 3,
        yearlyExecutionCount: 30,
        workflowCount: 5,
      }),
    );
    expect(payload.data[1]).toEqual(
      expect.objectContaining({
        weeklyRateLimit: null,
        yearlyRateLimit: null,
        stopBehavior: null,
        lastAdminComment: null,
        weeklyExecutionCount: 0,
        yearlyExecutionCount: 0,
        workflowCount: 0,
      }),
    );
  });
});

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
    const body = { weeklyRateLimit: null, yearlyRateLimit: null, lastAdminComment: null, stopBehavior: 'soft_stop' };
    const stored = makeStoredRateLimit({
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
    ['a missing stopBehavior', { weeklyRateLimit: 100, yearlyRateLimit: 5000, lastAdminComment: null }],
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
/*  GET /projects/:projectId                                           */
/* ================================================================== */

describe('GET /ui-api/admin/projects/:projectId', () => {
  it('returns the enriched single-project item', async () => {
    const item = {
      projectId: VALID_PROJECT_ID,
      projectName: 'Configured project',
      projectType: 'team',
      tenantId: VALID_TENANT_ID,
      weeklyRateLimit: 10,
      yearlyRateLimit: 1000,
      stopBehavior: 'hard_stop',
      lastAdminComment: 'Cap for FY',
      weeklyExecutionCount: 3,
      yearlyExecutionCount: 30,
      workflowCount: 5,
      updatedAt: '2026-03-05T10:00:00.000Z',
      updatedByName: 'A. Lovelace',
    };
    const getAdminProjectById = vi.fn().mockResolvedValue(item);
    const { router } = createTestRouter({ projectTenant: { getAdminProjectById } });

    const handlers = getRouteHandlers(router, 'get', '/projects/:projectId');
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, query: {} });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(getAdminProjectById).toHaveBeenCalledWith(VALID_PROJECT_ID);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(item);
  });

  it('propagates the service AppError 404 for an unknown project', async () => {
    const getAdminProjectById = vi.fn().mockRejectedValue(new AppError(404, 'Project not found'));
    const { router } = createTestRouter({ projectTenant: { getAdminProjectById } });

    const handlers = getRouteHandlers(router, 'get', '/projects/:projectId');
    const req = createMockRequest({ params: { projectId: 'missing-project' }, query: {} });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 404);
    expect(res.json).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  GET /projects/:projectId/workflow-usage                            */
/* ================================================================== */

describe('GET /ui-api/admin/projects/:projectId/workflow-usage', () => {
  it('returns the per-workflow usage payload', async () => {
    const usage = {
      projectId: VALID_PROJECT_ID,
      weeklyPeriodKey: '2026-W44',
      yearlyPeriodKey: '2026',
      workflows: [{ workflowId: 'wf-100', workflowName: 'Alpha workflow', weeklyCount: 3, yearlyCount: 30 }],
    };
    const getProjectWorkflowUsage = vi.fn().mockResolvedValue(usage);
    const { router } = createTestRouter({ projectRateLimit: { getProjectWorkflowUsage } });

    const handlers = getRouteHandlers(router, 'get', '/projects/:projectId/workflow-usage');
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, query: {} });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(getProjectWorkflowUsage).toHaveBeenCalledWith(VALID_PROJECT_ID);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(usage);
  });

  it('propagates the service AppError 404 for an unknown project', async () => {
    const getProjectWorkflowUsage = vi.fn().mockRejectedValue(new AppError(404, 'Project not found'));
    const { router } = createTestRouter({ projectRateLimit: { getProjectWorkflowUsage } });

    const handlers = getRouteHandlers(router, 'get', '/projects/:projectId/workflow-usage');
    const req = createMockRequest({ params: { projectId: 'missing-project' }, query: {} });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 404);
    expect(res.json).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  GET /projects/:projectId/topups                                    */
/* ================================================================== */

describe('GET /ui-api/admin/projects/:projectId/topups', () => {
  it('returns one page of top-ups with the default paging applied by the parser', async () => {
    const pageData = { data: [], pagination: { page: 1, pageSize: 4, totalItems: 0, totalPages: 1 } };
    const listProjectTopups = vi.fn().mockResolvedValue(pageData);
    const { router } = createTestRouter({ projectRateLimit: { listProjectTopups } });

    const handlers = getRouteHandlers(router, 'get', TOPUPS_ROUTE);
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, query: {} });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(listProjectTopups).toHaveBeenCalledWith(VALID_PROJECT_ID, 1, 4);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(pageData);
  });

  it('passes explicit page and pageSize query values through to the service', async () => {
    const listProjectTopups = vi.fn().mockResolvedValue({ data: [], pagination: {} });
    const { router } = createTestRouter({ projectRateLimit: { listProjectTopups } });

    const handlers = getRouteHandlers(router, 'get', TOPUPS_ROUTE);
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID },
      query: { page: '2', pageSize: '10' },
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(listProjectTopups).toHaveBeenCalledWith(VALID_PROJECT_ID, 2, 10);
  });

  it('propagates the service AppError 404 for an unknown project', async () => {
    const listProjectTopups = vi.fn().mockRejectedValue(new AppError(404, 'Project not found'));
    const { router } = createTestRouter({ projectRateLimit: { listProjectTopups } });

    const handlers = getRouteHandlers(router, 'get', TOPUPS_ROUTE);
    const req = createMockRequest({ params: { projectId: 'missing-project' }, query: {} });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 404);
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
