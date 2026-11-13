/**
 * Unit tests for the shared project read routes in
 * `src/api/routes/projects.ts` (mounted at /ui-api/projects by the parent
 * router in ui-api.ts, behind the UI session + canManageProject guards).
 *
 * Role branching lives inside the handlers: admins get every n8n project;
 * members are scoped to the projects they can access in n8n (list via the
 * user-scoped service method, single-project reads via an access assertion
 * that runs before the shared service call).
 *
 * Strategy: build the sub-router with mocked services, then invoke each
 * route's handler chain (zod request parser + handler) directly through
 * the Express router stack. The auth/permission guards are mounted by the
 * parent router and are covered by the ui-api route tests.
 */
import { describe, expect, it, vi } from 'vitest';

import { buildProjectsRouter } from '../../../src/api/routes/projects';
import { AppError } from '../../../src/api/utils/errors';
import { createMockRequest, createMockResponse, VALID_PROJECT_ID } from '../../helpers/mocks';
import { expectNextAppError, getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';

const MEMBER_USER_ID = 'n8n-user-77';

/**
 * Runs the full handler chain like `runHandlerChain`, but records every error
 * handoff (`next(err)`) on the returned mock so `expectNextAppError` can
 * assert what reaches the central error middleware.
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

function makeSession(sessionOverrides: Record<string, unknown> = {}) {
  return {
    permissions: { isAdmin: true },
    n8nUser: { id: 'admin-n8n-user', email: 'admin@example.com' },
    ...sessionOverrides,
  } as any;
}

function makeAdminSession() {
  return makeSession();
}

function makeMemberSession() {
  return makeSession({
    permissions: { isAdmin: false },
    n8nUser: { id: MEMBER_USER_ID, email: 'member@example.com' },
  });
}

function createTestRouter(serviceOverrides: Record<string, any> = {}) {
  const projectTenant = {
    listAllProjectsWithTenants: vi.fn(),
    listProjectsWithTenantsForUser: vi.fn(),
    assertUserProjectAccess: vi.fn(),
    getProjectById: vi.fn(),
    ...serviceOverrides.projectTenant,
  };
  const projectRateLimit = {
    getProjectWorkflowUsage: vi.fn(),
    listProjectTopups: vi.fn(),
    ...serviceOverrides.projectRateLimit,
  };

  const router = buildProjectsRouter({ services: { projectTenant, projectRateLimit } } as any);
  return { router, projectTenant, projectRateLimit };
}

/* ================================================================== */
/*  GET /projects                                                      */
/* ================================================================== */

describe('GET /ui-api/projects', () => {
  it('lists every project for an admin session', async () => {
    const page = {
      data: [
        {
          projectId: VALID_PROJECT_ID,
          projectName: 'Configured project',
          projectType: 'team',
          tenantId: null,
          weeklyRateLimit: 10,
          yearlyRateLimit: 1000,
          stopBehavior: 'hard_stop',
          lastAdminComment: 'Cap for FY',
          weeklyExecutionCount: 3,
          yearlyExecutionCount: 30,
          workflowCount: 5,
        },
      ],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
    };
    const listAllProjectsWithTenants = vi.fn().mockResolvedValue(page);
    const listProjectsWithTenantsForUser = vi.fn();
    const { router } = createTestRouter({
      projectTenant: { listAllProjectsWithTenants, listProjectsWithTenantsForUser },
    });

    const handlers = getRouteHandlers(router, 'get', '/');
    const req = createMockRequest({ query: {}, session: makeAdminSession() });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(listAllProjectsWithTenants).toHaveBeenCalledWith(1, 25, { search: undefined, type: undefined });
    expect(listProjectsWithTenantsForUser).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(page);
  });

  it("scopes the list to the member's accessible projects", async () => {
    const page = { data: [], pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } };
    const listAllProjectsWithTenants = vi.fn();
    const listProjectsWithTenantsForUser = vi.fn().mockResolvedValue(page);
    const { router } = createTestRouter({
      projectTenant: { listAllProjectsWithTenants, listProjectsWithTenantsForUser },
    });

    const handlers = getRouteHandlers(router, 'get', '/');
    const req = createMockRequest({ query: {}, session: makeMemberSession() });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(listProjectsWithTenantsForUser).toHaveBeenCalledWith(
      1,
      25,
      { search: undefined, type: undefined },
      MEMBER_USER_ID,
    );
    expect(listAllProjectsWithTenants).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(page);
  });

  it('passes the search and type filters through to the scoped list', async () => {
    const listProjectsWithTenantsForUser = vi
      .fn()
      .mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } });
    const { router } = createTestRouter({ projectTenant: { listProjectsWithTenantsForUser } });

    const handlers = getRouteHandlers(router, 'get', '/');
    const req = createMockRequest({ query: { search: 'CITZ', type: 'team' }, session: makeMemberSession() });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(listProjectsWithTenantsForUser).toHaveBeenCalledWith(
      1,
      25,
      { search: 'CITZ', type: 'team' },
      MEMBER_USER_ID,
    );
  });

  it('falls back to an empty user id when the session has no n8n user', async () => {
    const listProjectsWithTenantsForUser = vi
      .fn()
      .mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } });
    const { router } = createTestRouter({ projectTenant: { listProjectsWithTenantsForUser } });

    const handlers = getRouteHandlers(router, 'get', '/');
    const req = createMockRequest({
      query: {},
      session: makeSession({ permissions: { isAdmin: false }, n8nUser: null }),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(listProjectsWithTenantsForUser).toHaveBeenCalledWith(1, 25, { search: undefined, type: undefined }, '');
  });
});

/* ================================================================== */
/*  GET /projects/:projectId                                           */
/* ================================================================== */

describe('GET /ui-api/projects/:projectId', () => {
  it('returns the project without an access assertion for an admin session', async () => {
    const item = { projectId: VALID_PROJECT_ID, projectName: 'Configured project', projectType: 'team' };
    const assertUserProjectAccess = vi.fn();
    const getProjectById = vi.fn().mockResolvedValue(item);
    const { router } = createTestRouter({ projectTenant: { assertUserProjectAccess, getProjectById } });

    const handlers = getRouteHandlers(router, 'get', '/:projectId');
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, query: {}, session: makeAdminSession() });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(assertUserProjectAccess).not.toHaveBeenCalled();
    // Admins also get their membership role resolved (null when not a member).
    expect(getProjectById).toHaveBeenCalledWith(VALID_PROJECT_ID, 'admin-n8n-user');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(item);
  });

  it('asserts member access before returning the project', async () => {
    const item = { projectId: VALID_PROJECT_ID, projectName: 'My project', projectType: 'personal' };
    const assertUserProjectAccess = vi.fn().mockResolvedValue(undefined);
    const getProjectById = vi.fn().mockResolvedValue(item);
    const { router } = createTestRouter({ projectTenant: { assertUserProjectAccess, getProjectById } });

    const handlers = getRouteHandlers(router, 'get', '/:projectId');
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, query: {}, session: makeMemberSession() });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(assertUserProjectAccess).toHaveBeenCalledWith(VALID_PROJECT_ID, MEMBER_USER_ID);
    expect(getProjectById).toHaveBeenCalledWith(VALID_PROJECT_ID, MEMBER_USER_ID);
    expect(res.json).toHaveBeenCalledWith(item);
  });

  it('blocks a member from a project they cannot access before the detail service runs', async () => {
    const assertUserProjectAccess = vi
      .fn()
      .mockRejectedValue(new AppError(403, 'You do not have access to this project'));
    const getProjectById = vi.fn();
    const { router } = createTestRouter({ projectTenant: { assertUserProjectAccess, getProjectById } });

    const handlers = getRouteHandlers(router, 'get', '/:projectId');
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, query: {}, session: makeMemberSession() });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 403);
    expect(getProjectById).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('propagates the service AppError 404 for an unknown project', async () => {
    const getProjectById = vi.fn().mockRejectedValue(new AppError(404, 'Project not found'));
    const { router } = createTestRouter({ projectTenant: { getProjectById } });

    const handlers = getRouteHandlers(router, 'get', '/:projectId');
    const req = createMockRequest({ params: { projectId: 'missing-project' }, query: {}, session: makeAdminSession() });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 404);
    expect(res.json).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  GET /projects/:projectId/workflow-usage                            */
/* ================================================================== */

describe('GET /ui-api/projects/:projectId/workflow-usage', () => {
  it('returns the per-workflow usage payload for an admin session', async () => {
    const usage = {
      projectId: VALID_PROJECT_ID,
      weeklyPeriodKey: '2026-W44',
      yearlyPeriodKey: '2026',
      workflows: [{ workflowId: 'wf-100', workflowName: 'Alpha workflow', weeklyCount: 3, yearlyCount: 30 }],
    };
    const assertUserProjectAccess = vi.fn();
    const getProjectWorkflowUsage = vi.fn().mockResolvedValue(usage);
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { getProjectWorkflowUsage },
    });

    const handlers = getRouteHandlers(router, 'get', '/:projectId/workflow-usage');
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, query: {}, session: makeAdminSession() });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(assertUserProjectAccess).not.toHaveBeenCalled();
    expect(getProjectWorkflowUsage).toHaveBeenCalledWith(VALID_PROJECT_ID);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(usage);
  });

  it('asserts member access before returning workflow usage', async () => {
    const assertUserProjectAccess = vi.fn().mockResolvedValue(undefined);
    const getProjectWorkflowUsage = vi.fn().mockResolvedValue({ projectId: VALID_PROJECT_ID, workflows: [] });
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { getProjectWorkflowUsage },
    });

    const handlers = getRouteHandlers(router, 'get', '/:projectId/workflow-usage');
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, query: {}, session: makeMemberSession() });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(assertUserProjectAccess).toHaveBeenCalledWith(VALID_PROJECT_ID, MEMBER_USER_ID);
    expect(getProjectWorkflowUsage).toHaveBeenCalledWith(VALID_PROJECT_ID);
  });

  it('blocks a member from workflow usage of a project they cannot access', async () => {
    const assertUserProjectAccess = vi
      .fn()
      .mockRejectedValue(new AppError(403, 'You do not have access to this project'));
    const getProjectWorkflowUsage = vi.fn();
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { getProjectWorkflowUsage },
    });

    const handlers = getRouteHandlers(router, 'get', '/:projectId/workflow-usage');
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, query: {}, session: makeMemberSession() });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 403);
    expect(getProjectWorkflowUsage).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  GET /projects/:projectId/topups                                    */
/* ================================================================== */

describe('GET /ui-api/projects/:projectId/topups', () => {
  it('returns one page of top-ups with the default paging for an admin session', async () => {
    const pageData = { data: [], pagination: { page: 1, pageSize: 4, totalItems: 0, totalPages: 1 } };
    const assertUserProjectAccess = vi.fn();
    const listProjectTopups = vi.fn().mockResolvedValue(pageData);
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { listProjectTopups },
    });

    const handlers = getRouteHandlers(router, 'get', '/:projectId/topups');
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, query: {}, session: makeAdminSession() });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(assertUserProjectAccess).not.toHaveBeenCalled();
    expect(listProjectTopups).toHaveBeenCalledWith(VALID_PROJECT_ID, 1, 4);
    expect(res.json).toHaveBeenCalledWith(pageData);
  });

  it('asserts member access and passes explicit paging values through', async () => {
    const assertUserProjectAccess = vi.fn().mockResolvedValue(undefined);
    const listProjectTopups = vi.fn().mockResolvedValue({ data: [], pagination: {} });
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { listProjectTopups },
    });

    const handlers = getRouteHandlers(router, 'get', '/:projectId/topups');
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID },
      query: { page: '2', pageSize: '10' },
      session: makeMemberSession(),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(assertUserProjectAccess).toHaveBeenCalledWith(VALID_PROJECT_ID, MEMBER_USER_ID);
    expect(listProjectTopups).toHaveBeenCalledWith(VALID_PROJECT_ID, 2, 10);
  });

  it('blocks a member from the top-up history of a project they cannot access', async () => {
    const assertUserProjectAccess = vi
      .fn()
      .mockRejectedValue(new AppError(403, 'You do not have access to this project'));
    const listProjectTopups = vi.fn();
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { listProjectTopups },
    });

    const handlers = getRouteHandlers(router, 'get', '/:projectId/topups');
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, query: {}, session: makeMemberSession() });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 403);
    expect(listProjectTopups).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  GET /projects/run-requests                                         */
/* ================================================================== */

describe('GET /ui-api/projects/run-requests', () => {
  it('lists every request for an admin session (review-queue pass-through)', async () => {
    const page = {
      data: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 1 },
      pending: { count: 0, oldestCreatedAt: null },
    };
    const listRunRequestsForAdmin = vi.fn().mockResolvedValue(page);
    const { router } = createTestRouter({
      projectRateLimit: { listRunRequestsForAdmin, listRunRequestsForUser: vi.fn() },
    });

    const handlers = getRouteHandlers(router, 'get', '/run-requests');
    const req = createMockRequest({
      query: { status: 'pending', page: '1', pageSize: '25' },
      session: makeAdminSession(),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(listRunRequestsForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', page: 1, pageSize: 25 }),
    );
    expect(listRunRequestsForAdmin.mock.calls[0][1]).toBeUndefined();
    expect(res.json).toHaveBeenCalledWith(page);
  });

  it('scopes the list to the member session user (service resolves accessible projects)', async () => {
    const page = {
      data: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 1 },
      pending: { count: 0, oldestCreatedAt: null },
    };
    const listRunRequestsForUser = vi.fn().mockResolvedValue(page);
    const { router } = createTestRouter({
      projectRateLimit: { listRunRequestsForAdmin: vi.fn(), listRunRequestsForUser },
    });

    const handlers = getRouteHandlers(router, 'get', '/run-requests');
    const req = createMockRequest({
      query: { status: 'all', search: 'devx', page: '2', pageSize: '25' },
      session: makeMemberSession(),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(listRunRequestsForUser).toHaveBeenCalledWith(
      MEMBER_USER_ID,
      expect.objectContaining({ status: 'all', search: 'devx', page: 2, pageSize: 25 }),
    );
    expect(res.json).toHaveBeenCalledWith(page);
  });
});

/* ================================================================== */
/*  POST /projects/:projectId/run-requests                             */
/* ================================================================== */

const RUN_REQUEST_BODY = {
  requestKind: 'extra_runs',
  extraRuns: 5_000,
  periodKey: '2026-W46',
  requestedWeeklyLimit: null,
  requestedAnnualLimit: null,
  reason: 'Fall intake started early',
};

describe('POST /ui-api/projects/:projectId/run-requests', () => {
  it('asserts member access, then files the request with the session user id', async () => {
    const request = { id: 'request-1', requestKind: 'extra_runs' };
    const assertUserProjectAccess = vi.fn();
    const createRunRequest = vi.fn().mockResolvedValue(request);
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { createRunRequest },
    });

    const handlers = getRouteHandlers(router, 'post', '/:projectId/run-requests');
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID },
      query: {},
      body: RUN_REQUEST_BODY,
      session: makeMemberSession(),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(assertUserProjectAccess).toHaveBeenCalledWith(VALID_PROJECT_ID, MEMBER_USER_ID);
    expect(createRunRequest).toHaveBeenCalledWith(
      VALID_PROJECT_ID,
      MEMBER_USER_ID,
      expect.objectContaining({ requestKind: 'extra_runs', extraRuns: 5_000 }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Run request submitted', request });
  });

  it('skips the member access assertion for an admin session (service still membership-gates)', async () => {
    const assertUserProjectAccess = vi.fn();
    const createRunRequest = vi.fn().mockResolvedValue({ id: 'request-1' });
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { createRunRequest },
    });

    const handlers = getRouteHandlers(router, 'post', '/:projectId/run-requests');
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID },
      query: {},
      body: RUN_REQUEST_BODY,
      session: makeAdminSession(),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(assertUserProjectAccess).not.toHaveBeenCalled();
    expect(createRunRequest).toHaveBeenCalledWith(VALID_PROJECT_ID, 'admin-n8n-user', expect.anything());
  });

  it('surfaces service rejections (409 duplicate pending, 403 ineligible) to the error middleware', async () => {
    const createRunRequest = vi
      .fn()
      .mockRejectedValue(new AppError(409, 'This project already has a request waiting for review'));
    const { router } = createTestRouter({ projectRateLimit: { createRunRequest } });

    const handlers = getRouteHandlers(router, 'post', '/:projectId/run-requests');
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID },
      query: {},
      body: RUN_REQUEST_BODY,
      session: makeMemberSession(),
    });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);
    expectNextAppError(next, 409);
  });
});

/* ================================================================== */
/*  DELETE /projects/:projectId/run-requests/:requestId                */
/* ================================================================== */

describe('DELETE /ui-api/projects/:projectId/run-requests/:requestId', () => {
  it('asserts member access, cancels the request, and answers 204', async () => {
    const assertUserProjectAccess = vi.fn();
    const cancelRunRequest = vi.fn();
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { cancelRunRequest },
    });

    const handlers = getRouteHandlers(router, 'delete', '/:projectId/run-requests/:requestId');
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID, requestId: '11111111-1111-4111-8111-111111111111' },
      query: {},
      session: makeMemberSession(),
    });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(assertUserProjectAccess).toHaveBeenCalledWith(VALID_PROJECT_ID, MEMBER_USER_ID);
    expect(cancelRunRequest).toHaveBeenCalledWith(
      VALID_PROJECT_ID,
      '11111111-1111-4111-8111-111111111111',
      MEMBER_USER_ID,
    );
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('surfaces a 404 when there is nothing to cancel', async () => {
    const cancelRunRequest = vi.fn().mockRejectedValue(new AppError(404, 'Pending request not found'));
    const { router } = createTestRouter({ projectRateLimit: { cancelRunRequest } });

    const handlers = getRouteHandlers(router, 'delete', '/:projectId/run-requests/:requestId');
    const req = createMockRequest({
      params: { projectId: VALID_PROJECT_ID, requestId: '11111111-1111-4111-8111-111111111111' },
      query: {},
      session: makeMemberSession(),
    });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);
    expectNextAppError(next, 404);
  });
});
