"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Unit tests for the CHEFS token exchange route handler
 * `POST /ui-api/wil/chefs-token` in `src/api/routes/wil.ts`.
 *
 * Strategy: build the router with mocked services and tenant repo,
 * mock `resolveWilTenantProjectIds` and `resolveActorIds` at module level,
 * and mock global `fetch` for the CHEFS gateway call.
 */
const vitest_1 = require("vitest");
/* ------------------------------------------------------------------ */
/*  Module mocks                                                       */
/* ------------------------------------------------------------------ */
const { resolveWilTenantProjectIdsMock, resolveActorMatchersMock, extractTenantIdMock } = vitest_1.vi.hoisted(() => ({
    resolveWilTenantProjectIdsMock: vitest_1.vi.fn(),
    resolveActorMatchersMock: vitest_1.vi.fn(),
    extractTenantIdMock: vitest_1.vi.fn(),
}));
vitest_1.vi.mock('../../../src/api/routes/helpers/wil-tenant', () => ({
    resolveWilTenantProjectIds: resolveWilTenantProjectIdsMock,
    extractTenantId: extractTenantIdMock,
}));
vitest_1.vi.mock('../../../src/api/routes/helpers/wil-actor', () => ({
    resolveActorMatchers: resolveActorMatchersMock,
}));
/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */
const wil_1 = require("../../../src/api/routes/wil");
const mocks_1 = require("../../helpers/mocks");
const test_utils_1 = require("../../helpers/test-utils");
const errors_1 = require("../../../src/api/utils/errors");
/* ------------------------------------------------------------------ */
/*  Test setup                                                         */
/* ------------------------------------------------------------------ */
const ALLOWED_PROJECT_IDS = ['proj-1', 'proj-2'];
const ACTOR_PRIMARY = 'user@example.com';
const ACTOR_FALLBACK = 'sub-123';
const TENANT_ID = '717626be-f59f-4e35-ac87-f84c4e11b865';
const SHOWFORM_ACTION = {
    id: 'act-001',
    actionType: 'showform',
    payload: {
        formApiKey: 'test-api-key-abc', // pragma: allowlist secret
        formId: 'form-123',
        formName: 'Test Form',
    },
    callbackUrl: 'https://example.com/callback',
    callbackMethod: 'POST',
    actorId: ACTOR_PRIMARY,
    status: 'pending',
};
function createTestRouter(serviceOverrides = {}) {
    const actionService = {
        list: vitest_1.vi.fn().mockResolvedValue([]),
        getById: vitest_1.vi.fn().mockResolvedValue(SHOWFORM_ACTION),
        updateStatus: vitest_1.vi.fn().mockResolvedValue('completed'),
        ...serviceOverrides.action,
    };
    const messageService = {
        list: vitest_1.vi.fn().mockResolvedValue([]),
        ...serviceOverrides.message,
    };
    const chefsService = {
        getFormToken: vitest_1.vi.fn().mockResolvedValue({
            authToken: 'jwt-token-123',
            formId: 'form-123',
            baseUrl: 'https://submit.digital.gov.bc.ca/app',
        }),
        resolveFormCredential: vitest_1.vi.fn().mockResolvedValue({
            formId: 'form-123',
            formApiKey: 'resolved-api-key', // pragma: allowlist secret
            formName: 'Credential Form',
        }),
        ...serviceOverrides.chefs,
    };
    const routeContext = {
        services: {
            action: actionService,
            message: messageService,
            chefs: chefsService,
            uiApi: {},
        },
        customRepositories: {
            tenantProjectRelation: {},
        },
    };
    const router = (0, wil_1.buildWilRouter)(routeContext);
    return { router, actionService, chefsService };
}
(0, vitest_1.beforeEach)(() => {
    resolveWilTenantProjectIdsMock.mockReset();
    resolveActorMatchersMock.mockReset();
    extractTenantIdMock.mockReset();
    vitest_1.vi.restoreAllMocks();
    resolveWilTenantProjectIdsMock.mockResolvedValue({ tenantId: TENANT_ID, projectIds: ALLOWED_PROJECT_IDS });
    extractTenantIdMock.mockReturnValue(TENANT_ID);
    resolveActorMatchersMock.mockReturnValue({
        userId: ACTOR_PRIMARY,
        userFallback: ACTOR_FALLBACK,
        roleNames: [],
        groupNames: [],
    });
});
/* ================================================================== */
/*  POST /chefs-token                                                  */
/* ================================================================== */
(0, vitest_1.describe)('POST /wil/chefs-token', () => {
    (0, vitest_1.it)('returns 200 with authToken, formId, formName on success', async () => {
        const { router } = createTestRouter();
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        const payload = res.json.mock.calls[0][0];
        (0, vitest_1.expect)(payload).toEqual({
            authToken: 'jwt-token-123',
            formId: 'form-123',
            formName: 'Test Form',
            baseUrl: 'https://submit.digital.gov.bc.ca/app',
        });
    });
    (0, vitest_1.it)('calls ChefsService.getFormToken with correct formId and formApiKey', async () => {
        const { router, chefsService } = createTestRouter();
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(chefsService.getFormToken).toHaveBeenCalledWith({
            formId: 'form-123',
            formApiKey: 'test-api-key-abc', // pragma: allowlist secret
        });
    });
    (0, vitest_1.it)('returns baseUrl from ChefsService response', async () => {
        const { router } = createTestRouter({
            chefs: {
                getFormToken: vitest_1.vi.fn().mockResolvedValue({
                    authToken: 'token-abc',
                    formId: 'form-123',
                    baseUrl: 'https://custom.example.com/app',
                }),
            },
        });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        const payload = res.json.mock.calls[0][0];
        (0, vitest_1.expect)(payload.baseUrl).toBe('https://custom.example.com/app');
    });
    (0, vitest_1.it)('throws AppError 400 when action type is not showform', async () => {
        const nonShowformAction = { ...SHOWFORM_ACTION, actionType: 'getapproval' };
        const { router } = createTestRouter({ action: { getById: vitest_1.vi.fn().mockResolvedValue(nonShowformAction) } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(400);
        (0, vitest_1.expect)(error.message).toBe('Invalid action type');
    });
    (0, vitest_1.it)('throws AppError 400 when formApiKey is missing from payload', async () => {
        const actionWithoutKey = {
            ...SHOWFORM_ACTION,
            payload: { formId: 'form-123', formName: 'Test Form' },
        };
        const { router } = createTestRouter({ action: { getById: vitest_1.vi.fn().mockResolvedValue(actionWithoutKey) } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(400);
        (0, vitest_1.expect)(error.message).toBe('Missing formApiKey');
    });
    (0, vitest_1.it)('throws AppError 404 when action is not found (service throws)', async () => {
        const notFoundError = new errors_1.AppError(404, 'Action not found');
        const { router } = createTestRouter({ action: { getById: vitest_1.vi.fn().mockRejectedValue(notFoundError) } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'nonexistent' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(404);
    });
    (0, vitest_1.it)('throws AppError 502 when ChefsService rejects with gateway error', async () => {
        const { router } = createTestRouter({
            chefs: {
                getFormToken: vitest_1.vi.fn().mockRejectedValue(new errors_1.AppError(502, 'CHEFS token exchange failed')),
            },
        });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(502);
        (0, vitest_1.expect)(error.message).toBe('CHEFS token exchange failed');
    });
    (0, vitest_1.it)('throws AppError 502 when ChefsService rejects with network error', async () => {
        const { router } = createTestRouter({
            chefs: {
                getFormToken: vitest_1.vi.fn().mockRejectedValue(new errors_1.AppError(502, 'CHEFS token exchange failed')),
            },
        });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(502);
        (0, vitest_1.expect)(error.message).toBe('CHEFS token exchange failed');
    });
    (0, vitest_1.it)('calls getById with resolved tenant project IDs and actor matchers', async () => {
        const getByIdMock = vitest_1.vi.fn().mockResolvedValue(SHOWFORM_ACTION);
        const { router } = createTestRouter({ action: { getById: getByIdMock } });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(getByIdMock).toHaveBeenCalledWith({
            allowedProjectIds: ALLOWED_PROJECT_IDS,
            actionId: 'act-001',
            actorMatchers: { userId: ACTOR_PRIMARY, userFallback: ACTOR_FALLBACK, roleNames: [], groupNames: [] },
        });
    });
    (0, vitest_1.it)('validation rejects missing actionId', async () => {
        const { router } = createTestRouter();
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: {}, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(400);
    });
    (0, vitest_1.it)('validation rejects empty actionId', async () => {
        const { router } = createTestRouter();
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: '' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(400);
    });
});
/* ================================================================== */
/*  POST /chefs-token — credential-ID (chefsFormAuth) path             */
/* ================================================================== */
(0, vitest_1.describe)('POST /wil/chefs-token — credential ID path', () => {
    const CREDENTIAL_ACTION = {
        ...SHOWFORM_ACTION,
        // The action's own project — a different project of the same tenant must not
        // be able to lend its credential.
        projectId: 'proj-2',
        payload: { chefsCredentialId: 'cred-999' },
    };
    (0, vitest_1.it)('resolves the credential and exchanges the token when chefsCredentialId is present', async () => {
        const { router, chefsService } = createTestRouter({
            action: { getById: vitest_1.vi.fn().mockResolvedValue(CREDENTIAL_ACTION) },
        });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(chefsService.resolveFormCredential).toHaveBeenCalledWith({
            credentialId: 'cred-999',
            allowedProjectIds: ['proj-2'],
        });
        // Key comes from the resolved credential, never from the payload.
        (0, vitest_1.expect)(chefsService.getFormToken).toHaveBeenCalledWith({
            formId: 'form-123',
            formApiKey: 'resolved-api-key', // pragma: allowlist secret
        });
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
    });
    (0, vitest_1.it)('prefers the credential ID over any inline formApiKey in the payload', async () => {
        const mixedAction = {
            ...SHOWFORM_ACTION,
            payload: { chefsCredentialId: 'cred-999', formApiKey: 'stale-inline-key', formId: 'stale-form' }, // pragma: allowlist secret
        };
        const { router, chefsService } = createTestRouter({
            action: { getById: vitest_1.vi.fn().mockResolvedValue(mixedAction) },
        });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(chefsService.resolveFormCredential).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(chefsService.getFormToken).toHaveBeenCalledWith({
            formId: 'form-123',
            formApiKey: 'resolved-api-key', // pragma: allowlist secret
        });
    });
    (0, vitest_1.it)('uses payload formName over the credential formName when both are present', async () => {
        const actionWithName = {
            ...SHOWFORM_ACTION,
            payload: { chefsCredentialId: 'cred-999', formName: 'Payload Form Name' },
        };
        const { router } = createTestRouter({
            action: { getById: vitest_1.vi.fn().mockResolvedValue(actionWithName) },
        });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        const payload = res.json.mock.calls[0][0];
        (0, vitest_1.expect)(payload.formName).toBe('Payload Form Name');
    });
    (0, vitest_1.it)('falls back to the credential formName when the payload has none', async () => {
        const { router } = createTestRouter({
            action: { getById: vitest_1.vi.fn().mockResolvedValue(CREDENTIAL_ACTION) },
        });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        const payload = res.json.mock.calls[0][0];
        (0, vitest_1.expect)(payload.formName).toBe('Credential Form');
    });
    (0, vitest_1.it)('propagates AppError 403 when the credential is outside the caller scope', async () => {
        const { router } = createTestRouter({
            action: { getById: vitest_1.vi.fn().mockResolvedValue(CREDENTIAL_ACTION) },
            chefs: {
                resolveFormCredential: vitest_1.vi
                    .fn()
                    .mockRejectedValue(new errors_1.AppError(403, 'Not authorized to use this CHEFS credential')),
            },
        });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(403);
    });
    (0, vitest_1.it)('propagates AppError 404 when the credential is not found', async () => {
        const { router } = createTestRouter({
            action: { getById: vitest_1.vi.fn().mockResolvedValue(CREDENTIAL_ACTION) },
            chefs: {
                resolveFormCredential: vitest_1.vi.fn().mockRejectedValue(new errors_1.AppError(404, 'CHEFS credential not found')),
            },
        });
        const handlers = (0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-token');
        const req = (0, mocks_1.createMockRequest)({ body: { actionId: 'act-001' }, session: {} });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)(handlers, req, res);
        (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
        (0, vitest_1.expect)(error.statusCode).toBe(404);
    });
});
