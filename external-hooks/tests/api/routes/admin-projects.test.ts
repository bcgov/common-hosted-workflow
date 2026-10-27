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
import { createMockRequest, createMockResponse, VALID_PROJECT_ID, VALID_TENANT_ID } from '../../helpers/mocks';
import { expectNextAppError, getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';

const RATE_LIMIT_ROUTE = '/projects/:projectId/rate-limit';

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
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function createTestRouter(serviceOverrides: Record<string, any> = {}) {
  const projectTenant = {
    listAllProjectsWithTenants: vi.fn(),
    assignTenantToProject: vi.fn(),
    removeTenantFromProject: vi.fn(),
    ...serviceOverrides.projectTenant,
  };
  const projectRateLimit = {
    updateRateLimit: vi.fn(),
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
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, body, query: {} });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(updateRateLimit).toHaveBeenCalledWith(VALID_PROJECT_ID, body);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Rate limit updated', rateLimit: stored });
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
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, body, query: {} });
    const res = createMockResponse();

    const error = await runHandlerChain(handlers!, req, res);

    expect(error).toBeNull();
    expect(updateRateLimit).toHaveBeenCalledWith(VALID_PROJECT_ID, body);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Rate limit updated', rateLimit: stored });
  });

  it('propagates the service AppError 404 to the central error middleware', async () => {
    const updateRateLimit = vi.fn().mockRejectedValue(new AppError(404, 'Project not found'));
    const { router } = createTestRouter({ projectRateLimit: { updateRateLimit } });

    const handlers = getRouteHandlers(router, 'put', RATE_LIMIT_ROUTE);
    const req = createMockRequest({ params: { projectId: 'missing-project' }, body: makeRateLimitBody(), query: {} });
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
    const req = createMockRequest({ params: { projectId: VALID_PROJECT_ID }, body: invalidBody, query: {} });
    const res = createMockResponse();

    const next = await runHandlerChainCapturingErrors(handlers!, req, res);

    expectNextAppError(next, 400);
    expect(updateRateLimit).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
