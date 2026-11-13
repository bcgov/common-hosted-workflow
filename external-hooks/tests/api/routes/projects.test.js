'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
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
const vitest_1 = require('vitest');
const projects_1 = require('../../../src/api/routes/projects');
const errors_1 = require('../../../src/api/utils/errors');
const mocks_1 = require('../../helpers/mocks');
const test_utils_1 = require('../../helpers/test-utils');
const MEMBER_USER_ID = 'n8n-user-77';
/**
 * Runs the full handler chain like `runHandlerChain`, but records every error
 * handoff (`next(err)`) on the returned mock so `expectNextAppError` can
 * assert what reaches the central error middleware.
 */
async function runHandlerChainCapturingErrors(handlers, req, res) {
  const next = vitest_1.vi.fn();
  let error = null;
  for (const handler of handlers) {
    if (error) break;
    await new Promise((resolve) => {
      const wrappedNext = (err) => {
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
          .catch((err) => {
            error = err;
            next(err);
            resolve();
          });
      }
    });
  }
  return next;
}
function makeSession(sessionOverrides = {}) {
  return {
    permissions: { isAdmin: true },
    n8nUser: { id: 'admin-n8n-user', email: 'admin@example.com' },
    ...sessionOverrides,
  };
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
function createTestRouter(serviceOverrides = {}) {
  const projectTenant = {
    listAllProjectsWithTenants: vitest_1.vi.fn(),
    listProjectsWithTenantsForUser: vitest_1.vi.fn(),
    assertUserProjectAccess: vitest_1.vi.fn(),
    getProjectById: vitest_1.vi.fn(),
    ...serviceOverrides.projectTenant,
  };
  const projectRateLimit = {
    getProjectWorkflowUsage: vitest_1.vi.fn(),
    listProjectTopups: vitest_1.vi.fn(),
    ...serviceOverrides.projectRateLimit,
  };
  const router = (0, projects_1.buildProjectsRouter)({ services: { projectTenant, projectRateLimit } });
  return { router, projectTenant, projectRateLimit };
}
/* ================================================================== */
/*  GET /projects                                                      */
/* ================================================================== */
(0, vitest_1.describe)('GET /ui-api/projects', () => {
  (0, vitest_1.it)('lists every project for an admin session', async () => {
    const page = {
      data: [
        {
          projectId: mocks_1.VALID_PROJECT_ID,
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
    const listAllProjectsWithTenants = vitest_1.vi.fn().mockResolvedValue(page);
    const listProjectsWithTenantsForUser = vitest_1.vi.fn();
    const { router } = createTestRouter({
      projectTenant: { listAllProjectsWithTenants, listProjectsWithTenantsForUser },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: makeAdminSession() });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(listAllProjectsWithTenants).toHaveBeenCalledWith(1, 25, {
      search: undefined,
      type: undefined,
    });
    (0, vitest_1.expect)(listProjectsWithTenantsForUser).not.toHaveBeenCalled();
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(page);
  });
  (0, vitest_1.it)("scopes the list to the member's accessible projects", async () => {
    const page = { data: [], pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } };
    const listAllProjectsWithTenants = vitest_1.vi.fn();
    const listProjectsWithTenantsForUser = vitest_1.vi.fn().mockResolvedValue(page);
    const { router } = createTestRouter({
      projectTenant: { listAllProjectsWithTenants, listProjectsWithTenantsForUser },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/');
    const req = (0, mocks_1.createMockRequest)({ query: {}, session: makeMemberSession() });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(listProjectsWithTenantsForUser).toHaveBeenCalledWith(
      1,
      25,
      { search: undefined, type: undefined },
      MEMBER_USER_ID,
    );
    (0, vitest_1.expect)(listAllProjectsWithTenants).not.toHaveBeenCalled();
    (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(page);
  });
  (0, vitest_1.it)('passes the search and type filters through to the scoped list', async () => {
    const listProjectsWithTenantsForUser = vitest_1.vi
      .fn()
      .mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } });
    const { router } = createTestRouter({ projectTenant: { listProjectsWithTenantsForUser } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/');
    const req = (0, mocks_1.createMockRequest)({
      query: { search: 'CITZ', type: 'team' },
      session: makeMemberSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(listProjectsWithTenantsForUser).toHaveBeenCalledWith(
      1,
      25,
      { search: 'CITZ', type: 'team' },
      MEMBER_USER_ID,
    );
  });
  (0, vitest_1.it)('falls back to an empty user id when the session has no n8n user', async () => {
    const listProjectsWithTenantsForUser = vitest_1.vi
      .fn()
      .mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } });
    const { router } = createTestRouter({ projectTenant: { listProjectsWithTenantsForUser } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/');
    const req = (0, mocks_1.createMockRequest)({
      query: {},
      session: makeSession({ permissions: { isAdmin: false }, n8nUser: null }),
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(listProjectsWithTenantsForUser).toHaveBeenCalledWith(
      1,
      25,
      { search: undefined, type: undefined },
      '',
    );
  });
});
/* ================================================================== */
/*  GET /projects/:projectId                                           */
/* ================================================================== */
(0, vitest_1.describe)('GET /ui-api/projects/:projectId', () => {
  (0, vitest_1.it)('returns the project without an access assertion for an admin session', async () => {
    const item = { projectId: mocks_1.VALID_PROJECT_ID, projectName: 'Configured project', projectType: 'team' };
    const assertUserProjectAccess = vitest_1.vi.fn();
    const getProjectById = vitest_1.vi.fn().mockResolvedValue(item);
    const { router } = createTestRouter({ projectTenant: { assertUserProjectAccess, getProjectById } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/:projectId');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: mocks_1.VALID_PROJECT_ID },
      query: {},
      session: makeAdminSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(assertUserProjectAccess).not.toHaveBeenCalled();
    // Admins also get their membership role resolved (null when not a member).
    (0, vitest_1.expect)(getProjectById).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, 'admin-n8n-user');
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(item);
  });
  (0, vitest_1.it)('asserts member access before returning the project', async () => {
    const item = { projectId: mocks_1.VALID_PROJECT_ID, projectName: 'My project', projectType: 'personal' };
    const assertUserProjectAccess = vitest_1.vi.fn().mockResolvedValue(undefined);
    const getProjectById = vitest_1.vi.fn().mockResolvedValue(item);
    const { router } = createTestRouter({ projectTenant: { assertUserProjectAccess, getProjectById } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/:projectId');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: mocks_1.VALID_PROJECT_ID },
      query: {},
      session: makeMemberSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(assertUserProjectAccess).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, MEMBER_USER_ID);
    (0, vitest_1.expect)(getProjectById).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, MEMBER_USER_ID);
    (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(item);
  });
  (0, vitest_1.it)('blocks a member from a project they cannot access before the detail service runs', async () => {
    const assertUserProjectAccess = vitest_1.vi
      .fn()
      .mockRejectedValue(new errors_1.AppError(403, 'You do not have access to this project'));
    const getProjectById = vitest_1.vi.fn();
    const { router } = createTestRouter({ projectTenant: { assertUserProjectAccess, getProjectById } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/:projectId');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: mocks_1.VALID_PROJECT_ID },
      query: {},
      session: makeMemberSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const next = await runHandlerChainCapturingErrors(handlers, req, res);
    (0, test_utils_1.expectNextAppError)(next, 403);
    (0, vitest_1.expect)(getProjectById).not.toHaveBeenCalled();
    (0, vitest_1.expect)(res.json).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('propagates the service AppError 404 for an unknown project', async () => {
    const getProjectById = vitest_1.vi.fn().mockRejectedValue(new errors_1.AppError(404, 'Project not found'));
    const { router } = createTestRouter({ projectTenant: { getProjectById } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/:projectId');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: 'missing-project' },
      query: {},
      session: makeAdminSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const next = await runHandlerChainCapturingErrors(handlers, req, res);
    (0, test_utils_1.expectNextAppError)(next, 404);
    (0, vitest_1.expect)(res.json).not.toHaveBeenCalled();
  });
});
/* ================================================================== */
/*  GET /projects/:projectId/workflow-usage                            */
/* ================================================================== */
(0, vitest_1.describe)('GET /ui-api/projects/:projectId/workflow-usage', () => {
  (0, vitest_1.it)('returns the per-workflow usage payload for an admin session', async () => {
    const usage = {
      projectId: mocks_1.VALID_PROJECT_ID,
      weeklyPeriodKey: '2026-W44',
      yearlyPeriodKey: '2026',
      workflows: [{ workflowId: 'wf-100', workflowName: 'Alpha workflow', weeklyCount: 3, yearlyCount: 30 }],
    };
    const assertUserProjectAccess = vitest_1.vi.fn();
    const getProjectWorkflowUsage = vitest_1.vi.fn().mockResolvedValue(usage);
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { getProjectWorkflowUsage },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/:projectId/workflow-usage');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: mocks_1.VALID_PROJECT_ID },
      query: {},
      session: makeAdminSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(assertUserProjectAccess).not.toHaveBeenCalled();
    (0, vitest_1.expect)(getProjectWorkflowUsage).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID);
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(usage);
  });
  (0, vitest_1.it)('asserts member access before returning workflow usage', async () => {
    const assertUserProjectAccess = vitest_1.vi.fn().mockResolvedValue(undefined);
    const getProjectWorkflowUsage = vitest_1.vi
      .fn()
      .mockResolvedValue({ projectId: mocks_1.VALID_PROJECT_ID, workflows: [] });
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { getProjectWorkflowUsage },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/:projectId/workflow-usage');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: mocks_1.VALID_PROJECT_ID },
      query: {},
      session: makeMemberSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(assertUserProjectAccess).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, MEMBER_USER_ID);
    (0, vitest_1.expect)(getProjectWorkflowUsage).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID);
  });
  (0, vitest_1.it)('blocks a member from workflow usage of a project they cannot access', async () => {
    const assertUserProjectAccess = vitest_1.vi
      .fn()
      .mockRejectedValue(new errors_1.AppError(403, 'You do not have access to this project'));
    const getProjectWorkflowUsage = vitest_1.vi.fn();
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { getProjectWorkflowUsage },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/:projectId/workflow-usage');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: mocks_1.VALID_PROJECT_ID },
      query: {},
      session: makeMemberSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const next = await runHandlerChainCapturingErrors(handlers, req, res);
    (0, test_utils_1.expectNextAppError)(next, 403);
    (0, vitest_1.expect)(getProjectWorkflowUsage).not.toHaveBeenCalled();
  });
});
/* ================================================================== */
/*  GET /projects/:projectId/topups                                    */
/* ================================================================== */
(0, vitest_1.describe)('GET /ui-api/projects/:projectId/topups', () => {
  (0, vitest_1.it)('returns one page of top-ups with the default paging for an admin session', async () => {
    const pageData = { data: [], pagination: { page: 1, pageSize: 4, totalItems: 0, totalPages: 1 } };
    const assertUserProjectAccess = vitest_1.vi.fn();
    const listProjectTopups = vitest_1.vi.fn().mockResolvedValue(pageData);
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { listProjectTopups },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/:projectId/topups');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: mocks_1.VALID_PROJECT_ID },
      query: {},
      session: makeAdminSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(assertUserProjectAccess).not.toHaveBeenCalled();
    (0, vitest_1.expect)(listProjectTopups).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, 1, 4);
    (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(pageData);
  });
  (0, vitest_1.it)('asserts member access and passes explicit paging values through', async () => {
    const assertUserProjectAccess = vitest_1.vi.fn().mockResolvedValue(undefined);
    const listProjectTopups = vitest_1.vi.fn().mockResolvedValue({ data: [], pagination: {} });
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { listProjectTopups },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/:projectId/topups');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: mocks_1.VALID_PROJECT_ID },
      query: { page: '2', pageSize: '10' },
      session: makeMemberSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(assertUserProjectAccess).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, MEMBER_USER_ID);
    (0, vitest_1.expect)(listProjectTopups).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, 2, 10);
  });
  (0, vitest_1.it)('blocks a member from the top-up history of a project they cannot access', async () => {
    const assertUserProjectAccess = vitest_1.vi
      .fn()
      .mockRejectedValue(new errors_1.AppError(403, 'You do not have access to this project'));
    const listProjectTopups = vitest_1.vi.fn();
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { listProjectTopups },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', '/:projectId/topups');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: mocks_1.VALID_PROJECT_ID },
      query: {},
      session: makeMemberSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const next = await runHandlerChainCapturingErrors(handlers, req, res);
    (0, test_utils_1.expectNextAppError)(next, 403);
    (0, vitest_1.expect)(listProjectTopups).not.toHaveBeenCalled();
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
(0, vitest_1.describe)('POST /ui-api/projects/:projectId/run-requests', () => {
  (0, vitest_1.it)('asserts member access, then files the request with the session user id', async () => {
    const request = { id: 'request-1', requestKind: 'extra_runs' };
    const assertUserProjectAccess = vitest_1.vi.fn();
    const createRunRequest = vitest_1.vi.fn().mockResolvedValue(request);
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { createRunRequest },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/:projectId/run-requests');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: mocks_1.VALID_PROJECT_ID },
      query: {},
      body: RUN_REQUEST_BODY,
      session: makeMemberSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(assertUserProjectAccess).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, MEMBER_USER_ID);
    (0, vitest_1.expect)(createRunRequest).toHaveBeenCalledWith(
      mocks_1.VALID_PROJECT_ID,
      MEMBER_USER_ID,
      vitest_1.expect.objectContaining({ requestKind: 'extra_runs', extraRuns: 5_000 }),
    );
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(201);
    (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ success: true, message: 'Run request submitted', request });
  });
  (0, vitest_1.it)(
    'skips the member access assertion for an admin session (service still membership-gates)',
    async () => {
      const assertUserProjectAccess = vitest_1.vi.fn();
      const createRunRequest = vitest_1.vi.fn().mockResolvedValue({ id: 'request-1' });
      const { router } = createTestRouter({
        projectTenant: { assertUserProjectAccess },
        projectRateLimit: { createRunRequest },
      });
      const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/:projectId/run-requests');
      const req = (0, mocks_1.createMockRequest)({
        params: { projectId: mocks_1.VALID_PROJECT_ID },
        query: {},
        body: RUN_REQUEST_BODY,
        session: makeAdminSession(),
      });
      const res = (0, mocks_1.createMockResponse)();
      const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
      (0, vitest_1.expect)(error).toBeNull();
      (0, vitest_1.expect)(assertUserProjectAccess).not.toHaveBeenCalled();
      (0, vitest_1.expect)(createRunRequest).toHaveBeenCalledWith(
        mocks_1.VALID_PROJECT_ID,
        'admin-n8n-user',
        vitest_1.expect.anything(),
      );
    },
  );
  (0, vitest_1.it)(
    'surfaces service rejections (409 duplicate pending, 403 ineligible) to the error middleware',
    async () => {
      const createRunRequest = vitest_1.vi
        .fn()
        .mockRejectedValue(new errors_1.AppError(409, 'This project already has a request waiting for review'));
      const { router } = createTestRouter({ projectRateLimit: { createRunRequest } });
      const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/:projectId/run-requests');
      const req = (0, mocks_1.createMockRequest)({
        params: { projectId: mocks_1.VALID_PROJECT_ID },
        query: {},
        body: RUN_REQUEST_BODY,
        session: makeMemberSession(),
      });
      const res = (0, mocks_1.createMockResponse)();
      const next = await runHandlerChainCapturingErrors(handlers, req, res);
      (0, test_utils_1.expectNextAppError)(next, 409);
    },
  );
});
/* ================================================================== */
/*  DELETE /projects/:projectId/run-requests/:requestId                */
/* ================================================================== */
(0, vitest_1.describe)('DELETE /ui-api/projects/:projectId/run-requests/:requestId', () => {
  (0, vitest_1.it)('asserts member access, cancels the request, and answers 204', async () => {
    const assertUserProjectAccess = vitest_1.vi.fn();
    const cancelRunRequest = vitest_1.vi.fn();
    const { router } = createTestRouter({
      projectTenant: { assertUserProjectAccess },
      projectRateLimit: { cancelRunRequest },
    });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'delete', '/:projectId/run-requests/:requestId');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: mocks_1.VALID_PROJECT_ID, requestId: '11111111-1111-4111-8111-111111111111' },
      query: {},
      session: makeMemberSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(assertUserProjectAccess).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, MEMBER_USER_ID);
    (0, vitest_1.expect)(cancelRunRequest).toHaveBeenCalledWith(
      mocks_1.VALID_PROJECT_ID,
      '11111111-1111-4111-8111-111111111111',
      MEMBER_USER_ID,
    );
    (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(204);
  });
  (0, vitest_1.it)('surfaces a 404 when there is nothing to cancel', async () => {
    const cancelRunRequest = vitest_1.vi
      .fn()
      .mockRejectedValue(new errors_1.AppError(404, 'Pending request not found'));
    const { router } = createTestRouter({ projectRateLimit: { cancelRunRequest } });
    const handlers = (0, test_utils_1.getRouteHandlers)(router, 'delete', '/:projectId/run-requests/:requestId');
    const req = (0, mocks_1.createMockRequest)({
      params: { projectId: mocks_1.VALID_PROJECT_ID, requestId: '11111111-1111-4111-8111-111111111111' },
      query: {},
      session: makeMemberSession(),
    });
    const res = (0, mocks_1.createMockResponse)();
    const next = await runHandlerChainCapturingErrors(handlers, req, res);
    (0, test_utils_1.expectNextAppError)(next, 404);
  });
});
