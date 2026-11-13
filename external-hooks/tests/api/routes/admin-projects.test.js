"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
const vitest_1 = require("vitest");
const admin_projects_1 = require("../../../src/api/routes/admin-projects");
const errors_1 = require("../../../src/api/utils/errors");
const mocks_1 = require("../../helpers/mocks");
const test_utils_1 = require("../../helpers/test-utils");
const RATE_LIMIT_ROUTE = '/projects/:projectId/rate-limit';
const TOPUPS_ROUTE = '/projects/:projectId/topups';
const TOPUP_DELETE_ROUTE = '/projects/:projectId/topups/:topupId';
const DEFAULTS_ROUTE = '/projects/rate-limit-defaults';
function makeRateLimitBody(overrides = {}) {
    return {
        usesDefaultLimits: false,
        weeklyRateLimit: 100,
        yearlyRateLimit: 5000,
        lastAdminComment: 'Approved by the platform team',
        stopBehavior: 'hard_stop',
        ...overrides,
    };
}
function makeStoredRateLimit(overrides = {}) {
    return {
        projectId: mocks_1.VALID_PROJECT_ID,
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
function makeTopupBody(overrides = {}) {
    return {
        periodKey: '2026-W45',
        amount: 2000,
        adminComment: '  Extra runs for the quarterly batch  ',
        ...overrides,
    };
}
function makeStoredTopup(overrides = {}) {
    return {
        id: mocks_1.VALID_TOPUP_ID,
        projectId: mocks_1.VALID_PROJECT_ID,
        periodKey: '2026-W45',
        amount: 2000,
        adminComment: 'Extra runs for the quarterly batch',
        createdBy: 'admin@example.com',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        ...overrides,
    };
}
function makeSession(sessionOverrides = {}) {
    return {
        n8nUser: { email: 'admin@example.com', firstName: 'Admin', lastName: 'User' },
        ...sessionOverrides,
    };
}
function createTestRouter(serviceOverrides = {}) {
    const projectTenant = {
        assignTenantToProject: vitest_1.vi.fn(),
        removeTenantFromProject: vitest_1.vi.fn(),
        ...serviceOverrides.projectTenant,
    };
    const projectRateLimit = {
        updateRateLimit: vitest_1.vi.fn(),
        createProjectTopup: vitest_1.vi.fn(),
        deleteProjectTopup: vitest_1.vi.fn(),
        getRateLimitDefaults: vitest_1.vi.fn(),
        updateRateLimitDefaults: vitest_1.vi.fn(),
        listRunRequestsForAdmin: vitest_1.vi.fn(),
        approveRunRequest: vitest_1.vi.fn(),
        denyRunRequest: vitest_1.vi.fn(),
        ...serviceOverrides.projectRateLimit,
    };
    const router = (0, admin_projects_1.buildAdminProjectRouter)({ services: { projectTenant, projectRateLimit } });
    return { router, projectTenant, projectRateLimit };
}
/**
 * Runs the full handler chain (zod parser + route handler) like
 * `runHandlerChain`, but records every error handoff — `next(err)` with a
 * truthy error, or a rejected async handler — on the returned mock so
 * `expectNextAppError` can assert what reaches the central error
 * middleware. Successful `next()` continuations are not recorded.
 */
async function runHandlerChainCapturingErrors(handlers, req, res) {
    const next = vitest_1.vi.fn();
    let error = null;
    for (const handler of handlers) {
        if (error)
            break;
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
/* ================================================================== */
/*  PUT /projects/:projectId/rate-limit                                */
/* ================================================================== */
(0, vitest_1.describe)(`PUT /ui-api/admin${RATE_LIMIT_ROUTE}`, () => {
    (0, vitest_1.it)('updates the rate limit and responds with the stored row', async () => {
        const body = makeRateLimitBody();
        const stored = makeStoredRateLimit();
        const updateRateLimit = vitest_1.vi.fn().mockResolvedValue(stored);
        const { router } = createTestRouter({ projectRateLimit: { updateRateLimit } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'put', RATE_LIMIT_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { projectId: mocks_1.VALID_PROJECT_ID },
            body,
            query: {},
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(updateRateLimit).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, body, 'admin@example.com');
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ success: true, message: 'Rate limit updated', rateLimit: stored });
    });
    (0, vitest_1.it)('passes null as the actor when the session has no n8n user', async () => {
        const body = makeRateLimitBody();
        const stored = makeStoredRateLimit();
        const updateRateLimit = vitest_1.vi.fn().mockResolvedValue(stored);
        const { router } = createTestRouter({ projectRateLimit: { updateRateLimit } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'put', RATE_LIMIT_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { projectId: mocks_1.VALID_PROJECT_ID },
            body,
            query: {},
            session: makeSession({ n8nUser: null }),
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(updateRateLimit).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, body, null);
    });
    (0, vitest_1.it)('accepts explicit nulls that clear the limits and the admin comment', async () => {
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
        const updateRateLimit = vitest_1.vi.fn().mockResolvedValue(stored);
        const { router } = createTestRouter({ projectRateLimit: { updateRateLimit } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'put', RATE_LIMIT_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { projectId: mocks_1.VALID_PROJECT_ID },
            body,
            query: {},
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(updateRateLimit).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, body, 'admin@example.com');
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ success: true, message: 'Rate limit updated', rateLimit: stored });
    });
    (0, vitest_1.it)('propagates the service AppError 404 to the central error middleware', async () => {
        const updateRateLimit = vitest_1.vi.fn().mockRejectedValue(new errors_1.AppError(404, 'Project not found'));
        const { router } = createTestRouter({ projectRateLimit: { updateRateLimit } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'put', RATE_LIMIT_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { projectId: 'missing-project' },
            body: makeRateLimitBody(),
            query: {},
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 404);
        (0, vitest_1.expect)(res.json).not.toHaveBeenCalled();
    });
    const invalidBodies = [
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
    vitest_1.it.each(invalidBodies)('rejects %s with AppError 400 before reaching the service', async (_label, invalidBody) => {
        const updateRateLimit = vitest_1.vi.fn().mockResolvedValue(makeStoredRateLimit());
        const { router } = createTestRouter({ projectRateLimit: { updateRateLimit } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'put', RATE_LIMIT_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { projectId: mocks_1.VALID_PROJECT_ID },
            body: invalidBody,
            query: {},
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 400);
        (0, vitest_1.expect)(updateRateLimit).not.toHaveBeenCalled();
        (0, vitest_1.expect)(res.json).not.toHaveBeenCalled();
    });
});
/* ================================================================== */
/*  POST /projects/:projectId/topups                                   */
/* ================================================================== */
(0, vitest_1.describe)('POST /ui-api/admin/projects/:projectId/topups', () => {
    (0, vitest_1.it)('adds a top-up and responds with the stored row wrapped in a success envelope', async () => {
        const body = makeTopupBody();
        const stored = makeStoredTopup();
        const createProjectTopup = vitest_1.vi.fn().mockResolvedValue(stored);
        const { router } = createTestRouter({ projectRateLimit: { createProjectTopup } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', TOPUPS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { projectId: mocks_1.VALID_PROJECT_ID },
            body,
            query: {},
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        // The zod parser trims the comment before the service sees it.
        (0, vitest_1.expect)(createProjectTopup).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, { ...body, adminComment: 'Extra runs for the quarterly batch' }, 'admin@example.com');
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ success: true, message: 'Top-up added', topup: stored });
    });
    (0, vitest_1.it)('passes null as the creator when the session has no n8n user', async () => {
        const createProjectTopup = vitest_1.vi.fn().mockResolvedValue(makeStoredTopup({ createdBy: null }));
        const { router } = createTestRouter({ projectRateLimit: { createProjectTopup } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', TOPUPS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { projectId: mocks_1.VALID_PROJECT_ID },
            body: makeTopupBody(),
            query: {},
            session: makeSession({ n8nUser: null }),
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        // The zod parser trims the comment before the service sees it.
        (0, vitest_1.expect)(createProjectTopup).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, { ...makeTopupBody(), adminComment: 'Extra runs for the quarterly batch' }, null);
    });
    (0, vitest_1.it)('propagates the service AppError 400 when the period is outside the top-up horizon', async () => {
        const createProjectTopup = vitest_1.vi
            .fn()
            .mockRejectedValue(new errors_1.AppError(400, 'periodKey must be the current week or a coming week within the top-up horizon'));
        const { router } = createTestRouter({ projectRateLimit: { createProjectTopup } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', TOPUPS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { projectId: mocks_1.VALID_PROJECT_ID },
            body: makeTopupBody(),
            query: {},
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 400);
        (0, vitest_1.expect)(res.json).not.toHaveBeenCalled();
    });
    const invalidTopupBodies = [
        ['a malformed periodKey', makeTopupBody({ periodKey: '2026-10-27' })],
        ['a zero amount', makeTopupBody({ amount: 0 })],
        ['a negative amount', makeTopupBody({ amount: -100 })],
        ['a non-integer amount', makeTopupBody({ amount: 12.5 })],
        ['an oversized amount', makeTopupBody({ amount: 1_000_001 })],
        ['an empty adminComment', makeTopupBody({ adminComment: '' })],
        ['a whitespace-only adminComment', makeTopupBody({ adminComment: '   ' })],
        ['an oversized adminComment', makeTopupBody({ adminComment: 'x'.repeat(2001) })],
    ];
    vitest_1.it.each(invalidTopupBodies)('rejects %s with AppError 400 before reaching the service', async (_label, invalidBody) => {
        const createProjectTopup = vitest_1.vi.fn().mockResolvedValue(makeStoredTopup());
        const { router } = createTestRouter({ projectRateLimit: { createProjectTopup } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', TOPUPS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { projectId: mocks_1.VALID_PROJECT_ID },
            body: invalidBody,
            query: {},
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 400);
        (0, vitest_1.expect)(createProjectTopup).not.toHaveBeenCalled();
        (0, vitest_1.expect)(res.json).not.toHaveBeenCalled();
    });
});
/* ================================================================== */
/*  DELETE /projects/:projectId/topups/:topupId                        */
/* ================================================================== */
(0, vitest_1.describe)('DELETE /ui-api/admin/projects/:projectId/topups/:topupId', () => {
    (0, vitest_1.it)('deletes a future-week top-up and responds 204 with no body', async () => {
        const deleteProjectTopup = vitest_1.vi.fn().mockResolvedValue(undefined);
        const { router } = createTestRouter({ projectRateLimit: { deleteProjectTopup } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'delete', TOPUP_DELETE_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { projectId: mocks_1.VALID_PROJECT_ID, topupId: mocks_1.VALID_TOPUP_ID },
            query: {},
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(deleteProjectTopup).toHaveBeenCalledWith(mocks_1.VALID_PROJECT_ID, mocks_1.VALID_TOPUP_ID);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(204);
        (0, vitest_1.expect)(res.end).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(res.json).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects a non-UUID topupId with AppError 400 before reaching the service', async () => {
        const deleteProjectTopup = vitest_1.vi.fn().mockResolvedValue(undefined);
        const { router } = createTestRouter({ projectRateLimit: { deleteProjectTopup } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'delete', TOPUP_DELETE_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { projectId: mocks_1.VALID_PROJECT_ID, topupId: 'not-a-uuid' },
            query: {},
        });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 400);
        (0, vitest_1.expect)(deleteProjectTopup).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('propagates the service AppError 409 for a top-up whose week already started', async () => {
        const deleteProjectTopup = vitest_1.vi
            .fn()
            .mockRejectedValue(new errors_1.AppError(409, 'Top-ups for the current or past weeks cannot be deleted'));
        const { router } = createTestRouter({ projectRateLimit: { deleteProjectTopup } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'delete', TOPUP_DELETE_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { projectId: mocks_1.VALID_PROJECT_ID, topupId: mocks_1.VALID_TOPUP_ID },
            query: {},
        });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 409);
        (0, vitest_1.expect)(res.json).not.toHaveBeenCalled();
    });
});
/* ================================================================== */
/*  GET /projects/rate-limit-defaults                                  */
/* ================================================================== */
(0, vitest_1.describe)(`GET /ui-api/admin${DEFAULTS_ROUTE}`, () => {
    (0, vitest_1.it)('returns the saved per-scope defaults without any usage counts', async () => {
        const defaults = {
            team: { weeklyRateLimit: 5000, yearlyRateLimit: 250000 },
            personal: { weeklyRateLimit: null, yearlyRateLimit: null },
        };
        const getRateLimitDefaults = vitest_1.vi.fn().mockResolvedValue(defaults);
        const { router } = createTestRouter({ projectRateLimit: { getRateLimitDefaults } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', DEFAULTS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({ query: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(getRateLimitDefaults).toHaveBeenCalledWith();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(defaults);
    });
    (0, vitest_1.it)('propagates the service error when reading the defaults fails', async () => {
        const getRateLimitDefaults = vitest_1.vi.fn().mockRejectedValue(new errors_1.AppError(500, 'Failed to read the rate-limit defaults'));
        const { router } = createTestRouter({ projectRateLimit: { getRateLimitDefaults } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', DEFAULTS_ROUTE);
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, (0, mocks_1.createMockRequest)({ query: {} }), res);
        (0, test_utils_1.expectNextAppError)(next, 500);
        (0, vitest_1.expect)(res.json).not.toHaveBeenCalled();
    });
});
/* ================================================================== */
/*  PUT /projects/rate-limit-defaults                                  */
/* ================================================================== */
(0, vitest_1.describe)(`PUT /ui-api/admin${DEFAULTS_ROUTE}`, () => {
    function makeDefaultsBody(overrides = {}) {
        return {
            team: { weeklyRateLimit: 5000, yearlyRateLimit: 250000 },
            personal: { weeklyRateLimit: 2500, yearlyRateLimit: 100000 },
            ...overrides,
        };
    }
    (0, vitest_1.it)('saves both scopes with the acting admin email and responds with the saved values', async () => {
        const body = makeDefaultsBody();
        const updateRateLimitDefaults = vitest_1.vi.fn().mockResolvedValue(body);
        const { router } = createTestRouter({ projectRateLimit: { updateRateLimitDefaults } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'put', DEFAULTS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({ body, query: {}, session: makeSession() });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(updateRateLimitDefaults).toHaveBeenCalledWith(body, 'admin@example.com');
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ success: true, message: 'Default limits updated', defaults: body });
    });
    (0, vitest_1.it)('passes null as the actor when the session has no n8n user', async () => {
        const body = makeDefaultsBody();
        const updateRateLimitDefaults = vitest_1.vi.fn().mockResolvedValue(body);
        const { router } = createTestRouter({ projectRateLimit: { updateRateLimitDefaults } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'put', DEFAULTS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({ body, query: {}, session: makeSession({ n8nUser: null }) });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(updateRateLimitDefaults).toHaveBeenCalledWith(body, null);
    });
    (0, vitest_1.it)('rejects a scope whose yearly default is below its weekly default (400)', async () => {
        const body = makeDefaultsBody({ personal: { weeklyRateLimit: 100000, yearlyRateLimit: 5000 } });
        const updateRateLimitDefaults = vitest_1.vi.fn();
        const { router } = createTestRouter({ projectRateLimit: { updateRateLimitDefaults } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'put', DEFAULTS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({ body, query: {}, session: makeSession() });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 400);
        (0, vitest_1.expect)(updateRateLimitDefaults).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects a missing scope (400)', async () => {
        const body = { team: { weeklyRateLimit: 5000, yearlyRateLimit: 250000 } };
        const updateRateLimitDefaults = vitest_1.vi.fn();
        const { router } = createTestRouter({ projectRateLimit: { updateRateLimitDefaults } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'put', DEFAULTS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({ body, query: {}, session: makeSession() });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 400);
        (0, vitest_1.expect)(updateRateLimitDefaults).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects negative defaults (400)', async () => {
        const body = makeDefaultsBody({ team: { weeklyRateLimit: -1, yearlyRateLimit: 250000 } });
        const updateRateLimitDefaults = vitest_1.vi.fn();
        const { router } = createTestRouter({ projectRateLimit: { updateRateLimitDefaults } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'put', DEFAULTS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({ body, query: {}, session: makeSession() });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 400);
        (0, vitest_1.expect)(updateRateLimitDefaults).not.toHaveBeenCalled();
    });
});
/* ================================================================== */
/*  Admin run-request review routes                                    */
/* ================================================================== */
const RUN_REQUESTS_ROUTE = '/projects/run-requests';
const RUN_REQUEST_APPROVE_ROUTE = '/projects/run-requests/:requestId/approve';
const RUN_REQUEST_DENY_ROUTE = '/projects/run-requests/:requestId/deny';
const VALID_RUN_REQUEST_ID = '22222222-2222-4222-8222-222222222222';
function makeRunRequestItem(overrides = {}) {
    return {
        id: VALID_RUN_REQUEST_ID,
        projectId: mocks_1.VALID_PROJECT_ID,
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
(0, vitest_1.describe)(`GET /ui-api/admin${RUN_REQUESTS_ROUTE}`, () => {
    (0, vitest_1.it)('lists run requests with the parser defaults (pending, page 1, pageSize 25)', async () => {
        const result = {
            data: [makeRunRequestItem()],
            pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
            pending: { count: 1, oldestCreatedAt: '2026-11-10T10:14:00.000Z' },
        };
        const listRunRequestsForAdmin = vitest_1.vi.fn().mockResolvedValue(result);
        const { router } = createTestRouter({ projectRateLimit: { listRunRequestsForAdmin } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', RUN_REQUESTS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({ query: {}, session: makeSession() });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(listRunRequestsForAdmin).toHaveBeenCalledWith({
            status: 'pending',
            search: undefined,
            page: 1,
            pageSize: 25,
        });
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(result);
    });
    (0, vitest_1.it)('passes the status, search and paging query through with coercion', async () => {
        const listRunRequestsForAdmin = vitest_1.vi.fn().mockResolvedValue({ data: [], pagination: {}, pending: {} });
        const { router } = createTestRouter({ projectRateLimit: { listRunRequestsForAdmin } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', RUN_REQUESTS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            query: { status: 'all', search: 'devx', page: '2', pageSize: '10' },
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(listRunRequestsForAdmin).toHaveBeenCalledWith({ status: 'all', search: 'devx', page: 2, pageSize: 10 });
    });
    (0, vitest_1.it)('rejects an unknown status filter (400)', async () => {
        const listRunRequestsForAdmin = vitest_1.vi.fn();
        const { router } = createTestRouter({ projectRateLimit: { listRunRequestsForAdmin } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'get', RUN_REQUESTS_ROUTE);
        const req = (0, mocks_1.createMockRequest)({ query: { status: 'maybe' }, session: makeSession() });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 400);
        (0, vitest_1.expect)(listRunRequestsForAdmin).not.toHaveBeenCalled();
    });
});
(0, vitest_1.describe)(`POST /ui-api/admin${RUN_REQUEST_APPROVE_ROUTE}`, () => {
    (0, vitest_1.it)('approves a request and responds with the decided row', async () => {
        const decided = makeRunRequestItem({ status: 'approved', grantedRuns: 3000, decidedBy: 'admin@example.com' });
        const approveRunRequest = vitest_1.vi.fn().mockResolvedValue(decided);
        const { router } = createTestRouter({ projectRateLimit: { approveRunRequest } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', RUN_REQUEST_APPROVE_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { requestId: VALID_RUN_REQUEST_ID },
            body: { grantedRuns: 3000, note: 'Partial for now' },
            query: {},
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(approveRunRequest).toHaveBeenCalledWith(VALID_RUN_REQUEST_ID, { grantedRuns: 3000, note: 'Partial for now' }, 'admin@example.com');
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ success: true, message: 'Request approved', request: decided });
    });
    (0, vitest_1.it)('passes null as the decider when the session has no n8n user', async () => {
        const approveRunRequest = vitest_1.vi.fn().mockResolvedValue(makeRunRequestItem());
        const { router } = createTestRouter({ projectRateLimit: { approveRunRequest } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', RUN_REQUEST_APPROVE_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { requestId: VALID_RUN_REQUEST_ID },
            body: {},
            query: {},
            session: makeSession({ n8nUser: null }),
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(approveRunRequest).toHaveBeenCalledWith(VALID_RUN_REQUEST_ID, {}, null);
    });
    (0, vitest_1.it)('rejects grants below the minimum (400)', async () => {
        const approveRunRequest = vitest_1.vi.fn();
        const { router } = createTestRouter({ projectRateLimit: { approveRunRequest } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', RUN_REQUEST_APPROVE_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { requestId: VALID_RUN_REQUEST_ID },
            body: { grantedRuns: 50 },
            query: {},
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 400);
        (0, vitest_1.expect)(approveRunRequest).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('propagates service errors (409 already decided)', async () => {
        const approveRunRequest = vitest_1.vi.fn().mockRejectedValue(new errors_1.AppError(409, 'This request has already been decided'));
        const { router } = createTestRouter({ projectRateLimit: { approveRunRequest } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', RUN_REQUEST_APPROVE_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { requestId: VALID_RUN_REQUEST_ID },
            body: {},
            query: {},
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 409);
    });
});
(0, vitest_1.describe)(`POST /ui-api/admin${RUN_REQUEST_DENY_ROUTE}`, () => {
    (0, vitest_1.it)('denies a request with the reason and responds with the rejected row', async () => {
        const reason = 'Not enough platform quota this quarter. Please ask again in January.';
        const rejected = makeRunRequestItem({ status: 'denied', decisionNote: reason });
        const denyRunRequest = vitest_1.vi.fn().mockResolvedValue(rejected);
        const { router } = createTestRouter({ projectRateLimit: { denyRunRequest } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', RUN_REQUEST_DENY_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { requestId: VALID_RUN_REQUEST_ID },
            body: { reason },
            query: {},
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(denyRunRequest).toHaveBeenCalledWith(VALID_RUN_REQUEST_ID, { reason }, 'admin@example.com');
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ success: true, message: 'Request denied', request: rejected });
    });
    (0, vitest_1.it)('rejects a too-short reason (400)', async () => {
        const denyRunRequest = vitest_1.vi.fn();
        const { router } = createTestRouter({ projectRateLimit: { denyRunRequest } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', RUN_REQUEST_DENY_ROUTE);
        const req = (0, mocks_1.createMockRequest)({
            params: { requestId: VALID_RUN_REQUEST_ID },
            body: { reason: 'too short' },
            query: {},
            session: makeSession(),
        });
        const res = (0, mocks_1.createMockResponse)();
        const next = await runHandlerChainCapturingErrors(handlers, req, res);
        (0, test_utils_1.expectNextAppError)(next, 400);
        (0, vitest_1.expect)(denyRunRequest).not.toHaveBeenCalled();
    });
});
