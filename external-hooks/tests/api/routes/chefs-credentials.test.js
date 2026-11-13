"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * CHEFS credential routes act as the signed-in n8n user so n8n's permission
 * model decides access; a session without an n8n user is refused.
 */
const vitest_1 = require("vitest");
const { resolveWilTenantProjectIdsMock } = vitest_1.vi.hoisted(() => ({ resolveWilTenantProjectIdsMock: vitest_1.vi.fn() }));
vitest_1.vi.mock('../../../src/api/routes/helpers/wil-tenant', () => ({
    resolveWilTenantProjectIds: resolveWilTenantProjectIdsMock,
    extractTenantId: vitest_1.vi.fn(),
}));
const triggers_1 = require("../../../src/api/routes/triggers");
const mocks_1 = require("../../helpers/mocks");
const test_utils_1 = require("../../helpers/test-utils");
const USER = { id: 'user-1', role: { slug: 'global:member' } };
const SESSION = { email: 'u@example.com', tenantRoles: [], n8nUser: { id: 'user-1' } };
function createRouter() {
    const chefs = {
        listFormCredentials: vitest_1.vi.fn().mockResolvedValue({ credentials: [], canCreate: true }),
        createFormCredential: vitest_1.vi.fn().mockResolvedValue({
            id: 'cred-new',
            name: 'Intake credential',
            formName: 'Intake',
            formId: 'form-123',
            baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
            scopes: ['credential:read'],
        }),
        updateFormCredential: vitest_1.vi.fn(),
    };
    const findByIdWithRole = vitest_1.vi.fn().mockResolvedValue(USER);
    const router = (0, triggers_1.buildTriggerRouter)({
        services: { chefs },
        customRepositories: { tenantProjectRelation: {} },
        n8nRepositories: { user: { findByIdWithRole } },
    });
    return { router, chefs, findByIdWithRole };
}
(0, vitest_1.beforeEach)(() => {
    resolveWilTenantProjectIdsMock.mockReset();
    resolveWilTenantProjectIdsMock.mockResolvedValue({ tenantId: 't-1', projectIds: ['proj-1', 'proj-2'] });
});
(0, vitest_1.describe)('GET /chefs-credentials', () => {
    (0, vitest_1.it)('lists as the n8n user within the tenant projects', async () => {
        const { router, chefs, findByIdWithRole } = createRouter();
        const req = (0, mocks_1.createMockRequest)({ session: SESSION });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)((0, test_utils_1.getRouteHandlers)(router, 'get', '/chefs-credentials'), req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(findByIdWithRole).toHaveBeenCalledWith('user-1');
        (0, vitest_1.expect)(chefs.listFormCredentials).toHaveBeenCalledWith(USER, ['proj-1', 'proj-2']);
        (0, vitest_1.expect)(res.json.mock.calls[0][0]).toEqual({ data: [], canCreate: true });
    });
    (0, vitest_1.it)('returns 403 when the session has no n8n user', async () => {
        const { router, chefs } = createRouter();
        const req = (0, mocks_1.createMockRequest)({ session: { ...SESSION, n8nUser: null } });
        const res = (0, mocks_1.createMockResponse)();
        await (0, test_utils_1.runHandlerChain)((0, test_utils_1.getRouteHandlers)(router, 'get', '/chefs-credentials'), req, res);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(403);
        (0, vitest_1.expect)(chefs.listFormCredentials).not.toHaveBeenCalled();
    });
});
(0, vitest_1.describe)('POST /chefs-credentials', () => {
    (0, vitest_1.it)('creates owned by the first tenant project only', async () => {
        const { router, chefs } = createRouter();
        const body = {
            name: 'Intake credential',
            formName: 'Intake',
            baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
            formId: 'form-123',
            apiKey: 'secret', // pragma: allowlist secret
        };
        const req = (0, mocks_1.createMockRequest)({ session: SESSION, body });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)((0, test_utils_1.getRouteHandlers)(router, 'post', '/chefs-credentials'), req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(chefs.createFormCredential).toHaveBeenCalledWith(USER, { ...body, projectId: 'proj-1' });
        (0, vitest_1.expect)(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret');
    });
});
(0, vitest_1.describe)('POST /triggers/:triggerId/chefs-token', () => {
    (0, vitest_1.it)("resolves the credential against the trigger's own project, not every tenant project", async () => {
        const trigger = {
            id: 'trig-1',
            projectId: 'proj-2',
            triggerType: 'chefs-form',
            allowedActorsType: 'all',
            allowedActors: ['*'],
            metadata: { n8nCredentialId: 'cred-1' },
        };
        const chefs = {
            resolveFormCredential: vitest_1.vi.fn().mockResolvedValue({ formId: 'form-123', formApiKey: 'key', formName: 'Intake' }), // pragma: allowlist secret
            getFormToken: vitest_1.vi
                .fn()
                .mockResolvedValue({ authToken: 'jwt', formId: 'form-123', baseUrl: 'https://submit.digital.gov.bc.ca/app' }),
        };
        const router = (0, triggers_1.buildTriggerRouter)({
            services: { chefs, trigger: { getById: vitest_1.vi.fn().mockResolvedValue(trigger) } },
            customRepositories: { tenantProjectRelation: { getRowByTenantId: vitest_1.vi.fn().mockResolvedValue(null) } },
            n8nRepositories: {},
        });
        const req = (0, mocks_1.createMockRequest)({ session: SESSION, params: { triggerId: 'trig-1' } });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)((0, test_utils_1.getRouteHandlers)(router, 'post', '/triggers/:triggerId/chefs-token'), req, res);
        (0, vitest_1.expect)(error).toBeNull();
        (0, vitest_1.expect)(chefs.resolveFormCredential).toHaveBeenCalledWith({ credentialId: 'cred-1', allowedProjectIds: ['proj-2'] });
    });
    (0, vitest_1.it)('returns 400 when a chefs-form trigger has no linked credential', async () => {
        const trigger = {
            id: 'trig-1',
            projectId: 'proj-2',
            triggerType: 'chefs-form',
            allowedActorsType: 'all',
            allowedActors: ['*'],
            metadata: { formId: 'form-123' },
        };
        const chefs = {
            resolveFormCredential: vitest_1.vi.fn(),
            getFormToken: vitest_1.vi.fn(),
        };
        const router = (0, triggers_1.buildTriggerRouter)({
            services: { chefs, trigger: { getById: vitest_1.vi.fn().mockResolvedValue(trigger) } },
            customRepositories: { tenantProjectRelation: { getRowByTenantId: vitest_1.vi.fn().mockResolvedValue(null) } },
            n8nRepositories: {},
        });
        const req = (0, mocks_1.createMockRequest)({ session: SESSION, params: { triggerId: 'trig-1' } });
        const res = (0, mocks_1.createMockResponse)();
        const error = await (0, test_utils_1.runHandlerChain)((0, test_utils_1.getRouteHandlers)(router, 'post', '/triggers/:triggerId/chefs-token'), req, res);
        (0, vitest_1.expect)(error?.statusCode).toBe(400);
        (0, vitest_1.expect)(chefs.resolveFormCredential).not.toHaveBeenCalled();
        (0, vitest_1.expect)(chefs.getFormToken).not.toHaveBeenCalled();
    });
});
