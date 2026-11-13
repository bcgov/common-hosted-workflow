"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const { getUiSessionMock, getUiOidcIdTokenMock, deleteUiOidcTokensMock, setUiLogoutHandleMock, fetchOidcDiscoveryDocumentMock, getOidcConfigFromEnvMock, getUiOidcAccessTokenByEmailMock, } = vitest_1.vi.hoisted(() => ({
    getUiSessionMock: vitest_1.vi.fn(),
    getUiOidcIdTokenMock: vitest_1.vi.fn(),
    deleteUiOidcTokensMock: vitest_1.vi.fn(),
    setUiLogoutHandleMock: vitest_1.vi.fn(),
    fetchOidcDiscoveryDocumentMock: vitest_1.vi.fn(),
    getOidcConfigFromEnvMock: vitest_1.vi.fn(),
    getUiOidcAccessTokenByEmailMock: vitest_1.vi.fn(),
}));
vitest_1.vi.mock('../../../src/api/helpers/ui-oidc', async () => {
    const actual = await vitest_1.vi.importActual('../../../src/api/helpers/ui-oidc');
    return {
        ...actual,
        getOidcConfigFromEnv: getOidcConfigFromEnvMock,
    };
});
vitest_1.vi.mock('../../../src/api/helpers/ui-oidc-session', async () => {
    const actual = await vitest_1.vi.importActual('../../../src/api/helpers/ui-oidc-session');
    return {
        ...actual,
        getUiSession: getUiSessionMock,
    };
});
vitest_1.vi.mock('../../../src/api/helpers/ui-oidc-store', async () => {
    const actual = await vitest_1.vi.importActual('../../../src/api/helpers/ui-oidc-store');
    return {
        ...actual,
        getUiOidcIdToken: getUiOidcIdTokenMock,
        deleteUiOidcTokens: deleteUiOidcTokensMock,
        setUiLogoutHandle: setUiLogoutHandleMock,
        getUiOidcAccessTokenByEmail: getUiOidcAccessTokenByEmailMock,
    };
});
vitest_1.vi.mock('../../../src/api/helpers/oidc-provider', async () => {
    const actual = await vitest_1.vi.importActual('../../../src/api/helpers/oidc-provider');
    return {
        ...actual,
        fetchOidcDiscoveryDocument: fetchOidcDiscoveryDocumentMock,
    };
});
const ui_api_1 = require("../../../src/api/routes/ui-api");
const mocks_1 = require("../../helpers/mocks");
const test_utils_1 = require("../../helpers/test-utils");
const mockTenantService = {
    getTenantRolesForSession: vitest_1.vi.fn().mockResolvedValue({ roles: [] }),
    getTenantGroupsForSession: vitest_1.vi.fn().mockResolvedValue({ groups: [] }),
};
const mockFeatureFlagService = {
    isFeatureEnabled: vitest_1.vi.fn((flag) => {
        // Default: all flags enabled for tests
        return ['workflow-share', 'wil', 'project', 'tenant-project-sync'].includes(flag);
    }),
    getAllFlags: vitest_1.vi.fn().mockReturnValue({}),
};
async function runRoute(router, method, path, req, res) {
    const handlers = (0, test_utils_1.getRouteHandlers)(router, method, path) ?? [];
    let index = 0;
    const next = async (error) => {
        if (error) {
            throw error;
        }
        const handler = handlers[index++];
        if (handler) {
            await handler(req, res, next);
        }
    };
    await next();
}
async function runProtectedRoute(services, method, path, req, res) {
    const servicesWithDefaults = { tenant: mockTenantService, featureFlag: mockFeatureFlagService, ...services };
    const router = (0, ui_api_1.buildUiApiRouter)({ services: servicesWithDefaults });
    await runRoute(router, method, path, req, res);
}
/**
 * Dispatches a real HTTP request against the full ui-api router. Required for
 * routes mounted with `router.use` (e.g. /ui-api/projects): getRouteHandlers
 * cannot traverse mounts, so guard + handler behavior is proven over HTTP.
 */
async function dispatchUiRequest(services, method, path) {
    const express = (await Promise.resolve().then(() => __importStar(require('express')))).default;
    const app = express();
    app.use(express.json());
    app.use('/ui-api', (0, ui_api_1.buildUiApiRouter)({
        services: { tenant: mockTenantService, featureFlag: mockFeatureFlagService, ...services },
    }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
        const { port } = server.address();
        return await fetch(`http://127.0.0.1:${port}/ui-api${path}`, {
            method: method.toUpperCase(),
            headers: { authorization: 'Bearer ui-test-token', 'content-type': 'application/json' },
        });
    }
    finally {
        await new Promise((resolve) => server.close(() => resolve()));
    }
}
(0, vitest_1.beforeEach)(() => {
    mockTenantService.getTenantRolesForSession.mockReset();
    mockTenantService.getTenantGroupsForSession.mockReset();
    mockTenantService.getTenantRolesForSession.mockResolvedValue({ roles: [] });
    mockTenantService.getTenantGroupsForSession.mockResolvedValue({ groups: [] });
    mockFeatureFlagService.isFeatureEnabled.mockReset();
    mockFeatureFlagService.isFeatureEnabled.mockImplementation((flag) => ['workflow-share', 'wil', 'project', 'tenant-project-sync'].includes(flag));
    getUiSessionMock.mockReset();
    getUiOidcIdTokenMock.mockReset();
    deleteUiOidcTokensMock.mockReset();
    fetchOidcDiscoveryDocumentMock.mockReset();
    getOidcConfigFromEnvMock.mockReset();
    getOidcConfigFromEnvMock.mockReturnValue({
        issuerUrl: '',
        authorizationEndpoint: '',
        tokenEndpoint: '',
        userinfoEndpoint: '',
        jwksUri: '',
        endSessionEndpoint: '',
        clientId: '',
        clientSecret: '',
        redirectUri: '',
        scopes: 'openid email profile',
    });
    getUiSessionMock.mockResolvedValue({
        subject: 'sub-1',
        email: 'person@example.com',
        issuer: 'https://issuer.example.com',
        audience: ['app'],
        claims: {},
        n8nUser: {
            id: 'user-123',
            email: 'person@example.com',
            role: null,
        },
    });
    deleteUiOidcTokensMock.mockResolvedValue(undefined);
    getUiOidcAccessTokenByEmailMock.mockReset();
    getUiOidcAccessTokenByEmailMock.mockResolvedValue('stored-upstream-access-token');
});
(0, vitest_1.describe)('GET /ui-api/session', () => {
    (0, vitest_1.it)('sets X-UI-Auth-Token when the session was refreshed', async () => {
        getUiSessionMock.mockResolvedValue({
            session: {
                subject: 'sub-1',
                email: 'person@example.com',
                issuer: 'https://issuer.example.com',
                audience: ['app'],
                claims: {},
            },
            refreshedToken: 'refreshed-token',
        });
        const uiApi = {
            loadUserContext: vitest_1.vi.fn().mockResolvedValue({
                n8nUser: {
                    id: 'user-123',
                    email: 'person@example.com',
                    disabled: false,
                    role: { slug: 'global:member', displayName: 'Member' },
                },
                accessibleProjectIds: [],
                projects: [],
                workflows: [],
            }),
        };
        const req = (0, mocks_1.createMockRequest)();
        const res = (0, mocks_1.createMockResponse)();
        res.setHeader = vitest_1.vi.fn();
        await runProtectedRoute({ uiApi }, 'get', '/session', req, res);
        (0, vitest_1.expect)(res.setHeader).toHaveBeenCalledWith('X-UI-Auth-Token', 'refreshed-token');
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            authenticated: true,
            permissions: {
                isAdmin: false,
                canViewWorkflows: true,
                canRequestAccess: false,
                canReviewAccessRequests: false,
                canShareWorkflows: true,
                canUnshareWorkflows: false,
                canManageWil: true,
                canManageProject: true,
            },
            goldDr: false,
        }));
    });
});
(0, vitest_1.describe)('OIDC session expiry clears n8n-auth and refresh extends it', () => {
    function createMockResWithCookies() {
        const res = (0, mocks_1.createMockResponse)();
        res.setHeader = vitest_1.vi.fn();
        res.clearCookie = vitest_1.vi.fn();
        res.cookie = vitest_1.vi.fn();
        return res;
    }
    (0, vitest_1.it)('clears n8n-auth on GET /session when OIDC session expired but n8n cookie is still live', async () => {
        getUiSessionMock.mockResolvedValue(null);
        const uiApi = {
            loadUserContext: vitest_1.vi.fn(),
        };
        const req = (0, mocks_1.createMockRequest)({
            headers: { authorization: 'Bearer expired-token' },
            cookies: { 'n8n-auth': 'live-n8n-token' },
        });
        // ensure getBearerToken sees header
        req.header = vitest_1.vi.fn((name) => {
            if (name.toLowerCase() === 'authorization')
                return 'Bearer expired-token';
            return undefined;
        });
        req.cookies = { 'n8n-auth': 'live-n8n-token' };
        const res = createMockResWithCookies();
        await runProtectedRoute({ uiApi }, 'get', '/session', req, res);
        (0, vitest_1.expect)(res.clearCookie).toHaveBeenCalledWith('n8n-auth', vitest_1.expect.objectContaining({ path: '/', httpOnly: true }));
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ authenticated: false }));
    });
    (0, vitest_1.it)('does not clear n8n-auth when no bearer was presented (anonymous n8n-only)', async () => {
        getUiSessionMock.mockResolvedValue(null);
        const uiApi = { loadUserContext: vitest_1.vi.fn() };
        const req = (0, mocks_1.createMockRequest)({
            cookies: { 'n8n-auth': 'live-n8n-token' },
        });
        req.header = vitest_1.vi.fn(() => undefined);
        req.cookies = { 'n8n-auth': 'live-n8n-token' };
        const res = createMockResWithCookies();
        await runProtectedRoute({ uiApi }, 'get', '/session', req, res);
        (0, vitest_1.expect)(res.clearCookie).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('extends n8n-auth cookie when UI JWT is refreshed', async () => {
        getUiSessionMock.mockResolvedValue({
            session: {
                subject: 'sub-1',
                email: 'person@example.com',
                issuer: 'https://issuer.example.com',
                audience: ['app'],
                claims: {},
            },
            refreshedToken: 'refreshed-token',
        });
        const uiApi = {
            loadUserContext: vitest_1.vi.fn().mockResolvedValue({
                n8nUser: {
                    id: 'user-123',
                    email: 'person@example.com',
                    disabled: false,
                    role: { slug: 'global:member', displayName: 'Member' },
                },
                accessibleProjectIds: [],
                projects: [],
                workflows: [],
            }),
        };
        const req = (0, mocks_1.createMockRequest)({
            headers: { authorization: 'Bearer near-expiry-jwt' },
            cookies: { 'n8n-auth': 'live-n8n-token' },
        });
        req.header = vitest_1.vi.fn((name) => {
            if (name.toLowerCase() === 'authorization')
                return 'Bearer near-expiry-jwt';
            return undefined;
        });
        req.cookies = { 'n8n-auth': 'live-n8n-token' };
        const res = createMockResWithCookies();
        await runProtectedRoute({ uiApi }, 'get', '/session', req, res);
        (0, vitest_1.expect)(res.cookie).toHaveBeenCalledWith('n8n-auth', 'live-n8n-token', vitest_1.expect.objectContaining({ httpOnly: true, path: '/', maxAge: 24 * 60 * 60 * 1000 }));
        (0, vitest_1.expect)(res.setHeader).toHaveBeenCalledWith('X-UI-Auth-Token', 'refreshed-token');
    });
    (0, vitest_1.it)('clears n8n-auth on protected route when bearer expired', async () => {
        getUiSessionMock.mockResolvedValue(null);
        const uiApi = { loadUserContext: vitest_1.vi.fn() };
        const req = (0, mocks_1.createMockRequest)({
            headers: { authorization: 'Bearer expired-token' },
            cookies: { 'n8n-auth': 'live-n8n-token' },
        });
        req.header = vitest_1.vi.fn((name) => {
            if (name.toLowerCase() === 'authorization')
                return 'Bearer expired-token';
            return undefined;
        });
        req.cookies = { 'n8n-auth': 'live-n8n-token' };
        req.get = vitest_1.vi.fn(() => undefined);
        const res = createMockResWithCookies();
        await runProtectedRoute({ uiApi }, 'get', '/whoami', req, res);
        (0, vitest_1.expect)(res.clearCookie).toHaveBeenCalledWith('n8n-auth', vitest_1.expect.anything());
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
    });
});
(0, vitest_1.describe)('GET /ui-api/auth/login', () => {
    (0, vitest_1.it)('redirects to the unified login endpoint', async () => {
        const router = (0, ui_api_1.buildUiApiRouter)({ services: {} });
        const req = (0, mocks_1.createMockRequest)({ query: { returnTo: '/ui/projects' } });
        const res = (0, mocks_1.createMockResponse)();
        await runRoute(router, 'get', '/auth/login', req, res);
        (0, vitest_1.expect)(res.redirect).toHaveBeenCalledWith('/rest/auth/oidc/login?returnTo=%2Fui%2Fprojects');
    });
});
(0, vitest_1.describe)('GET /ui-api/auth/logout', () => {
    (0, vitest_1.it)('redirects to the unified logout endpoint without trusting caller-supplied identity', async () => {
        const router = (0, ui_api_1.buildUiApiRouter)({ services: {} });
        const req = (0, mocks_1.createMockRequest)({ query: { email: 'person@example.com', returnTo: 'https://app.example.com/ui/' } });
        const res = (0, mocks_1.createMockResponse)();
        await runRoute(router, 'get', '/auth/logout', req, res);
        (0, vitest_1.expect)(res.redirect).toHaveBeenCalledWith('/rest/auth/oidc/logout?returnTo=https%3A%2F%2Fapp.example.com%2Fui%2F');
    });
});
(0, vitest_1.describe)('POST /ui-api/auth/logout-prepare', () => {
    (0, vitest_1.beforeEach)(() => {
        setUiLogoutHandleMock.mockReset();
        setUiLogoutHandleMock.mockResolvedValue(undefined);
    });
    (0, vitest_1.it)('rejects requests without a verified bearer session', async () => {
        getUiSessionMock.mockResolvedValue(null);
        const router = (0, ui_api_1.buildUiApiRouter)({ services: {} });
        const req = (0, mocks_1.createMockRequest)({ body: { returnTo: '/ui/' } });
        const res = (0, mocks_1.createMockResponse)();
        await runRoute(router, 'post', '/auth/logout-prepare', req, res);
        (0, vitest_1.expect)(setUiLogoutHandleMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
    });
    (0, vitest_1.it)('binds the handle to the verified session identity and validated return target', async () => {
        getUiSessionMock.mockResolvedValue({
            session: {
                subject: 'sub-1',
                email: 'person@example.com',
                issuer: 'https://issuer.example.com',
                audience: ['app'],
                claims: {},
            },
        });
        const router = (0, ui_api_1.buildUiApiRouter)({ services: {} });
        const req = (0, mocks_1.createMockRequest)({ body: { returnTo: '/ui/sessions' } });
        const res = (0, mocks_1.createMockResponse)();
        await runRoute(router, 'post', '/auth/logout-prepare', req, res);
        (0, vitest_1.expect)(setUiLogoutHandleMock).toHaveBeenCalledWith(vitest_1.expect.any(String), { email: 'person@example.com', returnTo: '/ui/sessions' }, 60_000);
        const [payload] = res.json.mock.calls[0];
        (0, vitest_1.expect)(payload.logoutUrl).toMatch(/^\/rest\/auth\/oidc\/logout\?logout=.+/);
        (0, vitest_1.expect)(payload.logoutUrl).not.toContain('email=');
    });
    (0, vitest_1.it)('binds the fallback destination when the requested return target is rejected', async () => {
        getUiSessionMock.mockResolvedValue({
            session: {
                subject: 'sub-1',
                email: 'person@example.com',
                issuer: 'https://issuer.example.com',
                audience: ['app'],
                claims: {},
            },
        });
        const router = (0, ui_api_1.buildUiApiRouter)({ services: {} });
        const req = (0, mocks_1.createMockRequest)({ body: { returnTo: 'https://evil.test/steal' } });
        const res = (0, mocks_1.createMockResponse)();
        await runRoute(router, 'post', '/auth/logout-prepare', req, res);
        const storedRecord = setUiLogoutHandleMock.mock.calls[0][1];
        (0, vitest_1.expect)(storedRecord.returnTo).toBe('/ui/');
    });
});
(0, vitest_1.describe)('GET /ui-api/whoami', () => {
    (0, vitest_1.it)('delegates to the ui api service', async () => {
        const uiApi = {
            loadUserContext: vitest_1.vi.fn().mockResolvedValue({
                n8nUser: {
                    id: 'user-123',
                    email: 'person@example.com',
                    disabled: false,
                    role: { slug: 'global:member', displayName: 'Member' },
                },
                accessibleProjectIds: ['proj-1'],
                projects: [],
                workflows: [],
            }),
        };
        const req = (0, mocks_1.createMockRequest)({ get: vitest_1.vi.fn(() => undefined) });
        const res = (0, mocks_1.createMockResponse)();
        await runProtectedRoute({ uiApi }, 'get', '/whoami', req, res);
        (0, vitest_1.expect)(getUiSessionMock).toHaveBeenCalledWith(req);
        (0, vitest_1.expect)(uiApi.loadUserContext).toHaveBeenCalledWith('person@example.com');
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            n8nUser: {
                id: 'user-123',
                email: 'person@example.com',
                disabled: false,
                role: { slug: 'global:member', displayName: 'Member' },
            },
            permissions: {
                isAdmin: false,
                canViewWorkflows: true,
                canRequestAccess: false,
                canReviewAccessRequests: false,
                canShareWorkflows: true,
                canUnshareWorkflows: false,
                canManageWil: true,
                canManageProject: true,
            },
        }));
    });
});
(0, vitest_1.describe)('GET /ui-api/workflows', () => {
    (0, vitest_1.it)('delegates to the ui api service', async () => {
        const uiApi = {
            loadUserContext: vitest_1.vi.fn().mockResolvedValue({
                n8nUser: {
                    id: 'user-123',
                    email: 'person@example.com',
                    disabled: false,
                    role: { slug: 'global:member', displayName: 'Member' },
                },
                accessibleProjectIds: ['proj-1'],
                projects: [
                    {
                        id: 'proj-1',
                        name: 'Project One',
                        type: 'personal',
                        createdAt: '2024-01-01T00:00:00.000Z',
                        updatedAt: '2024-01-01T00:00:00.000Z',
                        icon: null,
                        description: null,
                        creatorId: 'user-123',
                    },
                ],
                workflows: [
                    {
                        workflowId: 'wf-1',
                        workflowName: 'First workflow',
                        projectIds: ['proj-1'],
                        userEmails: ['person@example.com'],
                    },
                ],
            }),
        };
        const req = (0, mocks_1.createMockRequest)({ get: vitest_1.vi.fn(() => undefined) });
        const res = (0, mocks_1.createMockResponse)();
        await runProtectedRoute({ uiApi }, 'get', '/workflows', req, res);
        (0, vitest_1.expect)(uiApi.loadUserContext).toHaveBeenCalledWith('person@example.com');
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith([
            {
                workflowId: 'wf-1',
                workflowName: 'First workflow',
                projectIds: ['proj-1'],
                userEmails: ['person@example.com'],
            },
        ]);
    });
});
(0, vitest_1.describe)('POST /ui-api/workflows/:workflowId/share', () => {
    (0, vitest_1.it)('delegates to the ui api service', async () => {
        const uiApi = {
            loadUserContext: vitest_1.vi.fn().mockResolvedValue({
                n8nUser: {
                    id: 'user-123',
                    email: 'person@example.com',
                    disabled: false,
                    role: { slug: 'global:admin', displayName: 'Admin' },
                },
                accessibleProjectIds: ['proj-1'],
                projects: [],
                workflows: [],
                permissions: {
                    isAdmin: true,
                    canViewWorkflows: true,
                    canRequestAccess: false,
                    canReviewAccessRequests: true,
                    canShareWorkflows: true,
                    canUnshareWorkflows: true,
                },
            }),
            shareWorkflow: vitest_1.vi.fn().mockResolvedValue({
                workflowId: 'wf-1',
                sharedWithEmail: 'new@example.com',
            }),
        };
        const req = (0, mocks_1.createMockRequest)({
            params: { workflowId: 'wf-1' },
            body: { email: 'new@example.com' },
            get: vitest_1.vi.fn(() => undefined),
        });
        const res = (0, mocks_1.createMockResponse)();
        await runProtectedRoute({ uiApi }, 'post', '/workflows/:workflowId/share', req, res);
        (0, vitest_1.expect)(uiApi.loadUserContext).toHaveBeenCalledWith('person@example.com');
        (0, vitest_1.expect)(uiApi.shareWorkflow).toHaveBeenCalledWith('person@example.com', 'wf-1', 'new@example.com');
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(201);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            workflowId: 'wf-1',
            sharedWithEmail: 'new@example.com',
        }));
    });
});
(0, vitest_1.describe)('DELETE /ui-api/workflows/:workflowId/projects/:projectId', () => {
    (0, vitest_1.it)('delegates to the ui api service', async () => {
        const uiApi = {
            loadUserContext: vitest_1.vi.fn().mockResolvedValue({
                n8nUser: {
                    id: 'user-123',
                    email: 'person@example.com',
                    disabled: false,
                    role: { slug: 'global:admin', displayName: 'Admin' },
                },
                accessibleProjectIds: ['proj-1'],
                projects: [],
                workflows: [],
                permissions: {
                    isAdmin: true,
                    canViewWorkflows: true,
                    canRequestAccess: false,
                    canReviewAccessRequests: true,
                    canShareWorkflows: true,
                    canUnshareWorkflows: true,
                },
            }),
            unshareWorkflow: vitest_1.vi.fn().mockResolvedValue({
                workflowId: 'wf-1',
                projectId: 'proj-1',
            }),
        };
        const req = (0, mocks_1.createMockRequest)({
            params: { workflowId: 'wf-1', projectId: 'proj-1' },
            get: vitest_1.vi.fn(() => undefined),
        });
        const res = (0, mocks_1.createMockResponse)();
        await runProtectedRoute({ uiApi }, 'delete', '/workflows/:workflowId/projects/:projectId', req, res);
        (0, vitest_1.expect)(uiApi.loadUserContext).toHaveBeenCalledWith('person@example.com');
        (0, vitest_1.expect)(uiApi.unshareWorkflow).toHaveBeenCalledWith('person@example.com', 'wf-1', 'proj-1');
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            workflowId: 'wf-1',
            projectId: 'proj-1',
        }));
    });
});
(0, vitest_1.describe)('GET /ui-api/access-requests/my', () => {
    (0, vitest_1.it)('returns the wrapped access request response shape', async () => {
        const accessRequest = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            requesterEmail: 'person@example.com',
            justification: 'Need access to manage workflows.',
            status: 'pending',
            reviewerEmail: null,
            reviewerN8nUserId: null,
            denyReason: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
        };
        const uiApi = {
            loadUserContext: vitest_1.vi.fn().mockResolvedValue({
                n8nUser: {
                    id: 'user-123',
                    email: 'person@example.com',
                    disabled: false,
                    role: null,
                },
                accessibleProjectIds: [],
                projects: [],
                workflows: [],
            }),
        };
        const accessRequestService = {
            getMyAccessRequest: vitest_1.vi.fn().mockResolvedValue(accessRequest),
        };
        const req = (0, mocks_1.createMockRequest)({ get: vitest_1.vi.fn(() => undefined) });
        const res = (0, mocks_1.createMockResponse)();
        await runProtectedRoute({ uiApi, accessRequest: accessRequestService }, 'get', '/access-requests/my', req, res);
        (0, vitest_1.expect)(accessRequestService.getMyAccessRequest).toHaveBeenCalledWith('person@example.com');
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ accessRequest });
    });
});
(0, vitest_1.describe)('OIDC-02: ineligible and disabled user boundary', () => {
    function makeUnprovisionedContextService() {
        return {
            loadUserContext: vitest_1.vi.fn().mockResolvedValue({
                n8nUser: null,
                accessibleProjectIds: [],
                projects: [],
                workflows: [],
            }),
        };
    }
    function makeDisabledAdminContextService() {
        return {
            loadUserContext: vitest_1.vi.fn().mockResolvedValue({
                n8nUser: {
                    id: 'user-123',
                    email: 'person@example.com',
                    disabled: true,
                    role: { slug: 'global:admin', displayName: 'Admin' },
                },
                accessibleProjectIds: [],
                projects: [],
                workflows: [],
            }),
        };
    }
    function makeDeniedExpectations(res) {
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(403);
    }
    (0, vitest_1.describe)('unprovisioned identity (no n8n user)', () => {
        (0, vitest_1.it)('receives a session with only access-request capabilities and no synthetic n8n user', async () => {
            const uiApi = makeUnprovisionedContextService();
            const req = (0, mocks_1.createMockRequest)({ get: vitest_1.vi.fn(() => undefined) });
            const res = (0, mocks_1.createMockResponse)();
            await runProtectedRoute({ uiApi }, 'get', '/whoami', req, res);
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                n8nUser: null,
                permissions: {
                    isAdmin: false,
                    canViewWorkflows: false,
                    canRequestAccess: true,
                    canReviewAccessRequests: false,
                    canShareWorkflows: false,
                    canUnshareWorkflows: false,
                    canManageWil: false,
                    canManageProject: false,
                },
            }));
        });
        (0, vitest_1.it)('cannot list workflows', async () => {
            const uiApi = makeUnprovisionedContextService();
            const req = (0, mocks_1.createMockRequest)({ get: vitest_1.vi.fn(() => undefined) });
            const res = (0, mocks_1.createMockResponse)();
            await runProtectedRoute({ uiApi }, 'get', '/workflows', req, res);
            makeDeniedExpectations(res);
        });
        (0, vitest_1.it)('cannot list project tenants', async () => {
            const uiApi = makeUnprovisionedContextService();
            const projectTenant = { listProjectsWithTenantsForUser: vitest_1.vi.fn() };
            const response = await dispatchUiRequest({ uiApi, projectTenant }, 'get', '/projects');
            (0, vitest_1.expect)(response.status).toBe(403);
            (0, vitest_1.expect)(projectTenant.listProjectsWithTenantsForUser).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('can still create an access request', async () => {
            const accessRequest = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                requesterEmail: 'person@example.com',
                justification: 'Need access to manage workflows.',
                status: 'pending',
                reviewerEmail: null,
                reviewerN8nUserId: null,
                denyReason: null,
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
            };
            const accessRequestService = {
                createAccessRequest: vitest_1.vi.fn().mockResolvedValue(accessRequest),
            };
            const uiApi = makeUnprovisionedContextService();
            const req = (0, mocks_1.createMockRequest)({
                body: { justification: 'Need access to manage workflows.' },
                get: vitest_1.vi.fn(() => undefined),
            });
            const res = (0, mocks_1.createMockResponse)();
            await runProtectedRoute({ uiApi, accessRequest: accessRequestService }, 'post', '/access-requests', req, res);
            (0, vitest_1.expect)(accessRequestService.createAccessRequest).toHaveBeenCalledWith({
                requesterEmail: 'person@example.com',
                justification: 'Need access to manage workflows.',
            });
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(201);
        });
        (0, vitest_1.it)('can still view its own access request status', async () => {
            const accessRequestService = { getMyAccessRequest: vitest_1.vi.fn().mockResolvedValue(null) };
            const uiApi = makeUnprovisionedContextService();
            const req = (0, mocks_1.createMockRequest)({ get: vitest_1.vi.fn(() => undefined) });
            const res = (0, mocks_1.createMockResponse)();
            await runProtectedRoute({ uiApi, accessRequest: accessRequestService }, 'get', '/access-requests/my', req, res);
            (0, vitest_1.expect)(accessRequestService.getMyAccessRequest).toHaveBeenCalledWith('person@example.com');
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({ accessRequest: null });
        });
    });
    (0, vitest_1.describe)('disabled admin with a stale database role', () => {
        (0, vitest_1.it)('receives only access-request capabilities and a disabled n8n user representation', async () => {
            const uiApi = makeDisabledAdminContextService();
            const req = (0, mocks_1.createMockRequest)({ get: vitest_1.vi.fn(() => undefined) });
            const res = (0, mocks_1.createMockResponse)();
            await runProtectedRoute({ uiApi }, 'get', '/whoami', req, res);
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                n8nUser: {
                    id: 'user-123',
                    email: 'person@example.com',
                    disabled: true,
                    role: { slug: 'global:admin', displayName: 'Admin' },
                },
                permissions: {
                    isAdmin: false,
                    canViewWorkflows: false,
                    canRequestAccess: true,
                    canReviewAccessRequests: false,
                    canShareWorkflows: false,
                    canUnshareWorkflows: false,
                    canManageWil: false,
                    canManageProject: false,
                },
            }));
        });
        (0, vitest_1.it)('cannot list workflows', async () => {
            const uiApi = makeDisabledAdminContextService();
            const req = (0, mocks_1.createMockRequest)({ get: vitest_1.vi.fn(() => undefined) });
            const res = (0, mocks_1.createMockResponse)();
            await runProtectedRoute({ uiApi }, 'get', '/workflows', req, res);
            makeDeniedExpectations(res);
        });
        (0, vitest_1.it)('cannot share workflows', async () => {
            const uiApi = {
                ...makeDisabledAdminContextService(),
                shareWorkflow: vitest_1.vi.fn(),
            };
            const req = (0, mocks_1.createMockRequest)({
                params: { workflowId: 'wf-1' },
                body: { email: 'new@example.com' },
                get: vitest_1.vi.fn(() => undefined),
            });
            const res = (0, mocks_1.createMockResponse)();
            await runProtectedRoute({ uiApi }, 'post', '/workflows/:workflowId/share', req, res);
            makeDeniedExpectations(res);
            (0, vitest_1.expect)(uiApi.shareWorkflow).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('cannot unshare workflows', async () => {
            const uiApi = {
                ...makeDisabledAdminContextService(),
                unshareWorkflow: vitest_1.vi.fn(),
            };
            const req = (0, mocks_1.createMockRequest)({
                params: { workflowId: 'wf-1', projectId: 'proj-1' },
                get: vitest_1.vi.fn(() => undefined),
            });
            const res = (0, mocks_1.createMockResponse)();
            await runProtectedRoute({ uiApi }, 'delete', '/workflows/:workflowId/projects/:projectId', req, res);
            makeDeniedExpectations(res);
            (0, vitest_1.expect)(uiApi.unshareWorkflow).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('cannot pass the role guard to list access requests', async () => {
            const accessRequestService = { listAccessRequests: vitest_1.vi.fn() };
            const uiApi = makeDisabledAdminContextService();
            const req = (0, mocks_1.createMockRequest)({ get: vitest_1.vi.fn(() => undefined) });
            const res = (0, mocks_1.createMockResponse)();
            await runProtectedRoute({ uiApi, accessRequest: accessRequestService }, 'get', '/access-requests', req, res);
            makeDeniedExpectations(res);
            (0, vitest_1.expect)(accessRequestService.listAccessRequests).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('cannot pass the role guard to review access requests', async () => {
            const accessRequestService = { reviewAccessRequest: vitest_1.vi.fn() };
            const uiApi = makeDisabledAdminContextService();
            const req = (0, mocks_1.createMockRequest)({
                params: { id: '123e4567-e89b-12d3-a456-426614174000' },
                body: { action: 'approve' },
                get: vitest_1.vi.fn(() => undefined),
            });
            const res = (0, mocks_1.createMockResponse)();
            await runProtectedRoute({ uiApi, accessRequest: accessRequestService }, 'post', '/access-requests/:id/review', req, res);
            makeDeniedExpectations(res);
            (0, vitest_1.expect)(accessRequestService.reviewAccessRequest).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('cannot list project tenants', async () => {
            const uiApi = makeDisabledAdminContextService();
            const projectTenant = { listProjectsWithTenantsForUser: vitest_1.vi.fn() };
            const response = await dispatchUiRequest({ uiApi, projectTenant }, 'get', '/projects');
            (0, vitest_1.expect)(response.status).toBe(403);
            (0, vitest_1.expect)(projectTenant.listProjectsWithTenantsForUser).not.toHaveBeenCalled();
        });
    });
});
(0, vitest_1.describe)('GET /ui-api/projects (shared read endpoints)', () => {
    (0, vitest_1.it)('scopes the list to the member accessible projects via the shared sub-router', async () => {
        const uiApi = {
            loadUserContext: vitest_1.vi.fn().mockResolvedValue({
                n8nUser: {
                    id: 'user-123',
                    email: 'person@example.com',
                    disabled: false,
                    role: { slug: 'global:member', displayName: 'Member' },
                },
                accessibleProjectIds: [],
                projects: [],
                workflows: [],
            }),
        };
        const page = { data: [], pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } };
        const projectTenant = {
            listAllProjectsWithTenants: vitest_1.vi.fn(),
            listProjectsWithTenantsForUser: vitest_1.vi.fn().mockResolvedValue(page),
        };
        const response = await dispatchUiRequest({ uiApi, projectTenant }, 'get', '/projects');
        const payload = await response.json();
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(projectTenant.listProjectsWithTenantsForUser).toHaveBeenCalledWith(1, 25, { search: undefined, type: undefined }, 'user-123');
        (0, vitest_1.expect)(projectTenant.listAllProjectsWithTenants).not.toHaveBeenCalled();
        (0, vitest_1.expect)(payload).toEqual(page);
    });
    (0, vitest_1.it)('lists every project for an admin session', async () => {
        getUiSessionMock.mockResolvedValue({
            subject: 'sub-1',
            email: 'admin@example.com',
            issuer: 'https://issuer.example.com',
            audience: ['app'],
            claims: {},
            n8nUser: {
                id: 'admin-123',
                email: 'admin@example.com',
                role: { slug: 'global:admin', displayName: 'Admin' },
            },
        });
        const uiApi = {
            loadUserContext: vitest_1.vi.fn().mockResolvedValue({
                n8nUser: {
                    id: 'admin-123',
                    email: 'admin@example.com',
                    disabled: false,
                    role: { slug: 'global:admin', displayName: 'Admin' },
                },
                accessibleProjectIds: [],
                projects: [],
                workflows: [],
            }),
        };
        const page = { data: [], pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } };
        const projectTenant = {
            listAllProjectsWithTenants: vitest_1.vi.fn().mockResolvedValue(page),
            listProjectsWithTenantsForUser: vitest_1.vi.fn(),
        };
        const response = await dispatchUiRequest({ uiApi, projectTenant }, 'get', '/projects');
        const payload = await response.json();
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(projectTenant.listAllProjectsWithTenants).toHaveBeenCalledWith(1, 25, {
            search: undefined,
            type: undefined,
        });
        (0, vitest_1.expect)(projectTenant.listProjectsWithTenantsForUser).not.toHaveBeenCalled();
        (0, vitest_1.expect)(payload).toEqual(page);
    });
    (0, vitest_1.it)('returns 401 when unauthenticated', async () => {
        getUiSessionMock.mockResolvedValue(null);
        const projectTenant = {
            listProjectsWithTenantsForUser: vitest_1.vi.fn(),
        };
        const response = await dispatchUiRequest({ projectTenant }, 'get', '/projects');
        (0, vitest_1.expect)(response.status).toBe(401);
        (0, vitest_1.expect)(projectTenant.listProjectsWithTenantsForUser).not.toHaveBeenCalled();
    });
});
// ---------------------------------------------------------------------------
// /ui-api/admin/* mount guards
//
// The admin sub-router (projects list, tenant assignment, rate-limit update)
// is mounted behind requireUiRequestContext + checkPermission('canManageProject')
// + checkRole('global:owner','global:admin') in buildUiApiRouter. getRouteHandlers
// cannot traverse `router.use` mounts, so these tests dispatch real HTTP requests
// against an express app wrapping the real router — proving a non-admin caller is
// rejected before any admin service runs.
//
// Guard order matters: an enabled user with ANY n8n role passes the permission
// guard (canManageProject is role-gated only via the 'project' feature flag), so
// the admin gate is the role guard. The role-less case exercises the permission
// guard instead.
// ---------------------------------------------------------------------------
(0, vitest_1.describe)('/ui-api/admin/* mount guards', () => {
    async function dispatchAdminRequest(services, method, path, body) {
        const express = (await Promise.resolve().then(() => __importStar(require('express')))).default;
        const app = express();
        app.use(express.json());
        app.use('/ui-api', (0, ui_api_1.buildUiApiRouter)({
            services: { tenant: mockTenantService, featureFlag: mockFeatureFlagService, ...services },
        }));
        const server = app.listen(0, '127.0.0.1');
        await new Promise((resolve) => server.once('listening', resolve));
        try {
            const { port } = server.address();
            return await fetch(`http://127.0.0.1:${port}/ui-api${path}`, {
                method: method.toUpperCase(),
                headers: { authorization: 'Bearer ui-test-token', 'content-type': 'application/json' },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
        }
        finally {
            await new Promise((resolve) => server.close(() => resolve()));
        }
    }
    function makeContextService(roleSlug) {
        return {
            loadUserContext: vitest_1.vi.fn().mockResolvedValue({
                n8nUser: roleSlug === null
                    ? { id: 'user-123', email: 'person@example.com', disabled: false, role: null }
                    : {
                        id: 'user-123',
                        email: 'person@example.com',
                        disabled: false,
                        role: { slug: roleSlug, displayName: roleSlug },
                    },
                accessibleProjectIds: [],
                projects: [],
                workflows: [],
            }),
        };
    }
    (0, vitest_1.it)('rejects a member (non-admin role) from the projects list before the service runs', async () => {
        const projectTenant = { listAllProjectsWithTenants: vitest_1.vi.fn() };
        const response = await dispatchAdminRequest({ uiApi: makeContextService('global:member'), projectTenant }, 'get', '/admin/projects');
        (0, vitest_1.expect)(response.status).toBe(403);
        (0, vitest_1.expect)(projectTenant.listAllProjectsWithTenants).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects a member (non-admin role) from the rate-limit update endpoint before the service runs', async () => {
        const projectRateLimit = { updateRateLimit: vitest_1.vi.fn() };
        const response = await dispatchAdminRequest({ uiApi: makeContextService('global:member'), projectRateLimit }, 'put', '/admin/projects/proj-1/rate-limit', { weeklyRateLimit: 10, yearlyRateLimit: null, lastAdminComment: null, stopBehavior: 'hard_stop' });
        (0, vitest_1.expect)(response.status).toBe(403);
        (0, vitest_1.expect)(projectRateLimit.updateRateLimit).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('rejects a role-less identity at the permission guard before the service runs', async () => {
        const projectTenant = { listAllProjectsWithTenants: vitest_1.vi.fn() };
        const response = await dispatchAdminRequest({ uiApi: makeContextService(null), projectTenant }, 'get', '/admin/projects');
        (0, vitest_1.expect)(response.status).toBe(403);
        (0, vitest_1.expect)(projectTenant.listAllProjectsWithTenants).not.toHaveBeenCalled();
    });
});
