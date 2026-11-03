import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getUiSessionMock,
  getUiOidcIdTokenMock,
  deleteUiOidcTokensMock,
  setUiLogoutHandleMock,
  fetchOidcDiscoveryDocumentMock,
  getOidcConfigFromEnvMock,
  getUiOidcAccessTokenByEmailMock,
} = vi.hoisted(() => ({
  getUiSessionMock: vi.fn(),
  getUiOidcIdTokenMock: vi.fn(),
  deleteUiOidcTokensMock: vi.fn(),
  setUiLogoutHandleMock: vi.fn(),
  fetchOidcDiscoveryDocumentMock: vi.fn(),
  getOidcConfigFromEnvMock: vi.fn(),
  getUiOidcAccessTokenByEmailMock: vi.fn(),
}));

vi.mock('../../../src/api/helpers/ui-oidc', async () => {
  const actual = await vi.importActual<typeof import('../../../src/api/helpers/ui-oidc')>(
    '../../../src/api/helpers/ui-oidc',
  );

  return {
    ...actual,
    getOidcConfigFromEnv: getOidcConfigFromEnvMock,
  };
});

vi.mock('../../../src/api/helpers/ui-oidc-session', async () => {
  const actual = await vi.importActual<typeof import('../../../src/api/helpers/ui-oidc-session')>(
    '../../../src/api/helpers/ui-oidc-session',
  );

  return {
    ...actual,
    getUiSession: getUiSessionMock,
  };
});

vi.mock('../../../src/api/helpers/ui-oidc-store', async () => {
  const actual = await vi.importActual<typeof import('../../../src/api/helpers/ui-oidc-store')>(
    '../../../src/api/helpers/ui-oidc-store',
  );

  return {
    ...actual,
    getUiOidcIdToken: getUiOidcIdTokenMock,
    deleteUiOidcTokens: deleteUiOidcTokensMock,
    setUiLogoutHandle: setUiLogoutHandleMock,
    getUiOidcAccessTokenByEmail: getUiOidcAccessTokenByEmailMock,
  };
});

vi.mock('../../../src/api/helpers/oidc-provider', async () => {
  const actual = await vi.importActual<typeof import('../../../src/api/helpers/oidc-provider')>(
    '../../../src/api/helpers/oidc-provider',
  );

  return {
    ...actual,
    fetchOidcDiscoveryDocument: fetchOidcDiscoveryDocumentMock,
  };
});

import { buildUiApiRouter } from '../../../src/api/routes/ui-api';
import { createMockRequest, createMockResponse } from '../../helpers/mocks';
import { getRouteHandlers } from '../../helpers/test-utils';

const mockTenantService = {
  getTenantRolesForSession: vi.fn().mockResolvedValue({ roles: [] }),
  getTenantGroupsForSession: vi.fn().mockResolvedValue({ groups: [] }),
};

const mockFeatureFlagService = {
  isFeatureEnabled: vi.fn((flag: string) => {
    // Default: all flags enabled for tests
    return ['workflow-share', 'wil', 'project', 'tenant-project-sync'].includes(flag);
  }),
  getAllFlags: vi.fn().mockReturnValue({}),
};

async function runRoute(router: any, method: string, path: string, req: any, res: any) {
  const handlers = getRouteHandlers(router, method, path) ?? [];
  let index = 0;

  const next = async (error?: unknown) => {
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

async function runProtectedRoute(services: any, method: string, path: string, req: any, res: any) {
  const servicesWithDefaults = { tenant: mockTenantService, featureFlag: mockFeatureFlagService, ...services };
  const router = buildUiApiRouter({ services: servicesWithDefaults } as any);
  await runRoute(router, method, path, req, res);
}

/**
 * Dispatches a real HTTP request against the full ui-api router. Required for
 * routes mounted with `router.use` (e.g. /ui-api/projects): getRouteHandlers
 * cannot traverse mounts, so guard + handler behavior is proven over HTTP.
 */
async function dispatchUiRequest(services: Record<string, unknown>, method: 'get' | 'put', path: string) {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());
  app.use(
    '/ui-api',
    buildUiApiRouter({
      services: { tenant: mockTenantService, featureFlag: mockFeatureFlagService, ...services },
    } as any),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address() as { port: number };
    return await fetch(`http://127.0.0.1:${port}/ui-api${path}`, {
      method: method.toUpperCase(),
      headers: { authorization: 'Bearer ui-test-token', 'content-type': 'application/json' },
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

beforeEach(() => {
  mockTenantService.getTenantRolesForSession.mockReset();
  mockTenantService.getTenantGroupsForSession.mockReset();
  mockTenantService.getTenantRolesForSession.mockResolvedValue({ roles: [] });
  mockTenantService.getTenantGroupsForSession.mockResolvedValue({ groups: [] });
  mockFeatureFlagService.isFeatureEnabled.mockReset();
  mockFeatureFlagService.isFeatureEnabled.mockImplementation((flag: string) =>
    ['workflow-share', 'wil', 'project', 'tenant-project-sync'].includes(flag),
  );
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

describe('GET /ui-api/session', () => {
  it('sets X-UI-Auth-Token when the session was refreshed', async () => {
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
      loadUserContext: vi.fn().mockResolvedValue({
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
    const req = createMockRequest();
    const res = createMockResponse() as any;
    res.setHeader = vi.fn();

    await runProtectedRoute({ uiApi }, 'get', '/session', req as any, res as any);

    expect(res.setHeader).toHaveBeenCalledWith('X-UI-Auth-Token', 'refreshed-token');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
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
      }),
    );
  });
});

describe('OIDC session expiry clears n8n-auth and refresh extends it', () => {
  function createMockResWithCookies() {
    const res = createMockResponse() as any;
    res.setHeader = vi.fn();
    res.clearCookie = vi.fn();
    res.cookie = vi.fn();
    return res;
  }

  it('clears n8n-auth on GET /session when OIDC session expired but n8n cookie is still live', async () => {
    getUiSessionMock.mockResolvedValue(null);
    const uiApi = {
      loadUserContext: vi.fn(),
    };
    const req = createMockRequest({
      headers: { authorization: 'Bearer expired-token' },
      cookies: { 'n8n-auth': 'live-n8n-token' } as any,
    } as any);
    // ensure getBearerToken sees header
    (req as any).header = vi.fn((name: string) => {
      if (name.toLowerCase() === 'authorization') return 'Bearer expired-token';
      return undefined;
    });
    (req as any).cookies = { 'n8n-auth': 'live-n8n-token' };
    const res = createMockResWithCookies();

    await runProtectedRoute({ uiApi }, 'get', '/session', req as any, res as any);

    expect(res.clearCookie).toHaveBeenCalledWith('n8n-auth', expect.objectContaining({ path: '/', httpOnly: true }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ authenticated: false }));
  });

  it('does not clear n8n-auth when no bearer was presented (anonymous n8n-only)', async () => {
    getUiSessionMock.mockResolvedValue(null);
    const uiApi = { loadUserContext: vi.fn() };
    const req = createMockRequest({
      cookies: { 'n8n-auth': 'live-n8n-token' } as any,
    } as any);
    (req as any).header = vi.fn(() => undefined);
    (req as any).cookies = { 'n8n-auth': 'live-n8n-token' };
    const res = createMockResWithCookies();

    await runProtectedRoute({ uiApi }, 'get', '/session', req as any, res as any);

    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('extends n8n-auth cookie when UI JWT is refreshed', async () => {
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
      loadUserContext: vi.fn().mockResolvedValue({
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
    const req = createMockRequest({
      headers: { authorization: 'Bearer near-expiry-jwt' },
      cookies: { 'n8n-auth': 'live-n8n-token' } as any,
    } as any);
    (req as any).header = vi.fn((name: string) => {
      if (name.toLowerCase() === 'authorization') return 'Bearer near-expiry-jwt';
      return undefined;
    });
    (req as any).cookies = { 'n8n-auth': 'live-n8n-token' };
    const res = createMockResWithCookies();

    await runProtectedRoute({ uiApi }, 'get', '/session', req as any, res as any);

    expect(res.cookie).toHaveBeenCalledWith(
      'n8n-auth',
      'live-n8n-token',
      expect.objectContaining({ httpOnly: true, path: '/', maxAge: 24 * 60 * 60 * 1000 }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('X-UI-Auth-Token', 'refreshed-token');
  });

  it('clears n8n-auth on protected route when bearer expired', async () => {
    getUiSessionMock.mockResolvedValue(null);
    const uiApi = { loadUserContext: vi.fn() };
    const req = createMockRequest({
      headers: { authorization: 'Bearer expired-token' },
      cookies: { 'n8n-auth': 'live-n8n-token' } as any,
    } as any);
    (req as any).header = vi.fn((name: string) => {
      if (name.toLowerCase() === 'authorization') return 'Bearer expired-token';
      return undefined;
    });
    (req as any).cookies = { 'n8n-auth': 'live-n8n-token' };
    (req as any).get = vi.fn(() => undefined);
    const res = createMockResWithCookies();

    await runProtectedRoute({ uiApi }, 'get', '/whoami', req as any, res as any);

    expect(res.clearCookie).toHaveBeenCalledWith('n8n-auth', expect.anything());
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('GET /ui-api/auth/login', () => {
  it('redirects to the unified login endpoint', async () => {
    const router = buildUiApiRouter({ services: {} } as any);
    const req = createMockRequest({ query: { returnTo: '/ui/projects' } });
    const res = createMockResponse();

    await runRoute(router, 'get', '/auth/login', req as any, res as any);

    expect(res.redirect).toHaveBeenCalledWith('/rest/auth/oidc/login?returnTo=%2Fui%2Fprojects');
  });
});

describe('GET /ui-api/auth/logout', () => {
  it('redirects to the unified logout endpoint without trusting caller-supplied identity', async () => {
    const router = buildUiApiRouter({ services: {} } as any);
    const req = createMockRequest({ query: { email: 'person@example.com', returnTo: 'https://app.example.com/ui/' } });
    const res = createMockResponse();

    await runRoute(router, 'get', '/auth/logout', req as any, res as any);

    expect(res.redirect).toHaveBeenCalledWith('/rest/auth/oidc/logout?returnTo=https%3A%2F%2Fapp.example.com%2Fui%2F');
  });
});

describe('POST /ui-api/auth/logout-prepare', () => {
  beforeEach(() => {
    setUiLogoutHandleMock.mockReset();
    setUiLogoutHandleMock.mockResolvedValue(undefined);
  });

  it('rejects requests without a verified bearer session', async () => {
    getUiSessionMock.mockResolvedValue(null);
    const router = buildUiApiRouter({ services: {} } as any);
    const req = createMockRequest({ body: { returnTo: '/ui/' } });
    const res = createMockResponse();

    await runRoute(router, 'post', '/auth/logout-prepare', req as any, res as any);

    expect(setUiLogoutHandleMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('binds the handle to the verified session identity and validated return target', async () => {
    getUiSessionMock.mockResolvedValue({
      session: {
        subject: 'sub-1',
        email: 'person@example.com',
        issuer: 'https://issuer.example.com',
        audience: ['app'],
        claims: {},
      },
    });
    const router = buildUiApiRouter({ services: {} } as any);
    const req = createMockRequest({ body: { returnTo: '/ui/sessions' } });
    const res = createMockResponse();

    await runRoute(router, 'post', '/auth/logout-prepare', req as any, res as any);

    expect(setUiLogoutHandleMock).toHaveBeenCalledWith(
      expect.any(String),
      { email: 'person@example.com', returnTo: '/ui/sessions' },
      60_000,
    );
    const [payload] = res.json.mock.calls[0];
    expect(payload.logoutUrl).toMatch(/^\/rest\/auth\/oidc\/logout\?logout=.+/);
    expect(payload.logoutUrl).not.toContain('email=');
  });

  it('binds the fallback destination when the requested return target is rejected', async () => {
    getUiSessionMock.mockResolvedValue({
      session: {
        subject: 'sub-1',
        email: 'person@example.com',
        issuer: 'https://issuer.example.com',
        audience: ['app'],
        claims: {},
      },
    });
    const router = buildUiApiRouter({ services: {} } as any);
    const req = createMockRequest({ body: { returnTo: 'https://evil.test/steal' } });
    const res = createMockResponse();

    await runRoute(router, 'post', '/auth/logout-prepare', req as any, res as any);

    const storedRecord = setUiLogoutHandleMock.mock.calls[0][1];
    expect(storedRecord.returnTo).toBe('/ui/');
  });
});

describe('GET /ui-api/whoami', () => {
  it('delegates to the ui api service', async () => {
    const uiApi = {
      loadUserContext: vi.fn().mockResolvedValue({
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
    const req = createMockRequest({ get: vi.fn(() => undefined) as any });
    const res = createMockResponse();

    await runProtectedRoute({ uiApi }, 'get', '/whoami', req as any, res as any);

    expect(getUiSessionMock).toHaveBeenCalledWith(req);
    expect(uiApi.loadUserContext).toHaveBeenCalledWith('person@example.com');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
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
      }),
    );
  });
});

describe('GET /ui-api/workflows', () => {
  it('delegates to the ui api service', async () => {
    const uiApi = {
      loadUserContext: vi.fn().mockResolvedValue({
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
    const req = createMockRequest({ get: vi.fn(() => undefined) as any });
    const res = createMockResponse();

    await runProtectedRoute({ uiApi }, 'get', '/workflows', req as any, res as any);

    expect(uiApi.loadUserContext).toHaveBeenCalledWith('person@example.com');
    expect(res.json).toHaveBeenCalledWith([
      {
        workflowId: 'wf-1',
        workflowName: 'First workflow',
        projectIds: ['proj-1'],
        userEmails: ['person@example.com'],
      },
    ]);
  });
});

describe('POST /ui-api/workflows/:workflowId/share', () => {
  it('delegates to the ui api service', async () => {
    const uiApi = {
      loadUserContext: vi.fn().mockResolvedValue({
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
      shareWorkflow: vi.fn().mockResolvedValue({
        workflowId: 'wf-1',
        sharedWithEmail: 'new@example.com',
      }),
    };
    const req = createMockRequest({
      params: { workflowId: 'wf-1' },
      body: { email: 'new@example.com' },
      get: vi.fn(() => undefined) as any,
    });
    const res = createMockResponse();

    await runProtectedRoute({ uiApi }, 'post', '/workflows/:workflowId/share', req as any, res as any);

    expect(uiApi.loadUserContext).toHaveBeenCalledWith('person@example.com');
    expect(uiApi.shareWorkflow).toHaveBeenCalledWith('person@example.com', 'wf-1', 'new@example.com');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-1',
        sharedWithEmail: 'new@example.com',
      }),
    );
  });
});

describe('DELETE /ui-api/workflows/:workflowId/projects/:projectId', () => {
  it('delegates to the ui api service', async () => {
    const uiApi = {
      loadUserContext: vi.fn().mockResolvedValue({
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
      unshareWorkflow: vi.fn().mockResolvedValue({
        workflowId: 'wf-1',
        projectId: 'proj-1',
      }),
    };
    const req = createMockRequest({
      params: { workflowId: 'wf-1', projectId: 'proj-1' },
      get: vi.fn(() => undefined) as any,
    });
    const res = createMockResponse();

    await runProtectedRoute({ uiApi }, 'delete', '/workflows/:workflowId/projects/:projectId', req as any, res as any);

    expect(uiApi.loadUserContext).toHaveBeenCalledWith('person@example.com');
    expect(uiApi.unshareWorkflow).toHaveBeenCalledWith('person@example.com', 'wf-1', 'proj-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-1',
        projectId: 'proj-1',
      }),
    );
  });
});

describe('GET /ui-api/access-requests/my', () => {
  it('returns the wrapped access request response shape', async () => {
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
      loadUserContext: vi.fn().mockResolvedValue({
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
      getMyAccessRequest: vi.fn().mockResolvedValue(accessRequest),
    };
    const req = createMockRequest({ get: vi.fn(() => undefined) as any });
    const res = createMockResponse();

    await runProtectedRoute(
      { uiApi, accessRequest: accessRequestService },
      'get',
      '/access-requests/my',
      req as any,
      res as any,
    );

    expect(accessRequestService.getMyAccessRequest).toHaveBeenCalledWith('person@example.com');
    expect(res.json).toHaveBeenCalledWith({ accessRequest });
  });
});

describe('OIDC-02: ineligible and disabled user boundary', () => {
  function makeUnprovisionedContextService() {
    return {
      loadUserContext: vi.fn().mockResolvedValue({
        n8nUser: null,
        accessibleProjectIds: [],
        projects: [],
        workflows: [],
      }),
    };
  }

  function makeDisabledAdminContextService() {
    return {
      loadUserContext: vi.fn().mockResolvedValue({
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

  function makeDeniedExpectations(res: ReturnType<typeof createMockResponse>) {
    expect(res.status).toHaveBeenCalledWith(403);
  }

  describe('unprovisioned identity (no n8n user)', () => {
    it('receives a session with only access-request capabilities and no synthetic n8n user', async () => {
      const uiApi = makeUnprovisionedContextService();
      const req = createMockRequest({ get: vi.fn(() => undefined) as any });
      const res = createMockResponse();

      await runProtectedRoute({ uiApi }, 'get', '/whoami', req as any, res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
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
        }),
      );
    });

    it('cannot list workflows', async () => {
      const uiApi = makeUnprovisionedContextService();
      const req = createMockRequest({ get: vi.fn(() => undefined) as any });
      const res = createMockResponse();

      await runProtectedRoute({ uiApi }, 'get', '/workflows', req as any, res as any);

      makeDeniedExpectations(res);
    });

    it('cannot list project tenants', async () => {
      const uiApi = makeUnprovisionedContextService();
      const projectTenant = { listProjectsWithTenantsForUser: vi.fn() };

      const response = await dispatchUiRequest({ uiApi, projectTenant }, 'get', '/projects');

      expect(response.status).toBe(403);
      expect(projectTenant.listProjectsWithTenantsForUser).not.toHaveBeenCalled();
    });

    it('can still create an access request', async () => {
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
        createAccessRequest: vi.fn().mockResolvedValue(accessRequest),
      };
      const uiApi = makeUnprovisionedContextService();
      const req = createMockRequest({
        body: { justification: 'Need access to manage workflows.' },
        get: vi.fn(() => undefined) as any,
      });
      const res = createMockResponse();

      await runProtectedRoute(
        { uiApi, accessRequest: accessRequestService },
        'post',
        '/access-requests',
        req as any,
        res as any,
      );

      expect(accessRequestService.createAccessRequest).toHaveBeenCalledWith({
        requesterEmail: 'person@example.com',
        justification: 'Need access to manage workflows.',
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('can still view its own access request status', async () => {
      const accessRequestService = { getMyAccessRequest: vi.fn().mockResolvedValue(null) };
      const uiApi = makeUnprovisionedContextService();
      const req = createMockRequest({ get: vi.fn(() => undefined) as any });
      const res = createMockResponse();

      await runProtectedRoute(
        { uiApi, accessRequest: accessRequestService },
        'get',
        '/access-requests/my',
        req as any,
        res as any,
      );

      expect(accessRequestService.getMyAccessRequest).toHaveBeenCalledWith('person@example.com');
      expect(res.json).toHaveBeenCalledWith({ accessRequest: null });
    });
  });

  describe('disabled admin with a stale database role', () => {
    it('receives only access-request capabilities and a disabled n8n user representation', async () => {
      const uiApi = makeDisabledAdminContextService();
      const req = createMockRequest({ get: vi.fn(() => undefined) as any });
      const res = createMockResponse();

      await runProtectedRoute({ uiApi }, 'get', '/whoami', req as any, res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
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
        }),
      );
    });

    it('cannot list workflows', async () => {
      const uiApi = makeDisabledAdminContextService();
      const req = createMockRequest({ get: vi.fn(() => undefined) as any });
      const res = createMockResponse();

      await runProtectedRoute({ uiApi }, 'get', '/workflows', req as any, res as any);

      makeDeniedExpectations(res);
    });

    it('cannot share workflows', async () => {
      const uiApi = {
        ...makeDisabledAdminContextService(),
        shareWorkflow: vi.fn(),
      };
      const req = createMockRequest({
        params: { workflowId: 'wf-1' },
        body: { email: 'new@example.com' },
        get: vi.fn(() => undefined) as any,
      });
      const res = createMockResponse();

      await runProtectedRoute({ uiApi }, 'post', '/workflows/:workflowId/share', req as any, res as any);

      makeDeniedExpectations(res);
      expect(uiApi.shareWorkflow).not.toHaveBeenCalled();
    });

    it('cannot unshare workflows', async () => {
      const uiApi = {
        ...makeDisabledAdminContextService(),
        unshareWorkflow: vi.fn(),
      };
      const req = createMockRequest({
        params: { workflowId: 'wf-1', projectId: 'proj-1' },
        get: vi.fn(() => undefined) as any,
      });
      const res = createMockResponse();

      await runProtectedRoute(
        { uiApi },
        'delete',
        '/workflows/:workflowId/projects/:projectId',
        req as any,
        res as any,
      );

      makeDeniedExpectations(res);
      expect(uiApi.unshareWorkflow).not.toHaveBeenCalled();
    });

    it('cannot pass the role guard to list access requests', async () => {
      const accessRequestService = { listAccessRequests: vi.fn() };
      const uiApi = makeDisabledAdminContextService();
      const req = createMockRequest({ get: vi.fn(() => undefined) as any });
      const res = createMockResponse();

      await runProtectedRoute(
        { uiApi, accessRequest: accessRequestService },
        'get',
        '/access-requests',
        req as any,
        res as any,
      );

      makeDeniedExpectations(res);
      expect(accessRequestService.listAccessRequests).not.toHaveBeenCalled();
    });

    it('cannot pass the role guard to review access requests', async () => {
      const accessRequestService = { reviewAccessRequest: vi.fn() };
      const uiApi = makeDisabledAdminContextService();
      const req = createMockRequest({
        params: { id: '123e4567-e89b-12d3-a456-426614174000' },
        body: { action: 'approve' },
        get: vi.fn(() => undefined) as any,
      });
      const res = createMockResponse();

      await runProtectedRoute(
        { uiApi, accessRequest: accessRequestService },
        'post',
        '/access-requests/:id/review',
        req as any,
        res as any,
      );

      makeDeniedExpectations(res);
      expect(accessRequestService.reviewAccessRequest).not.toHaveBeenCalled();
    });

    it('cannot list project tenants', async () => {
      const uiApi = makeDisabledAdminContextService();
      const projectTenant = { listProjectsWithTenantsForUser: vi.fn() };

      const response = await dispatchUiRequest({ uiApi, projectTenant }, 'get', '/projects');

      expect(response.status).toBe(403);
      expect(projectTenant.listProjectsWithTenantsForUser).not.toHaveBeenCalled();
    });
  });
});

describe('GET /ui-api/projects (shared read endpoints)', () => {
  it('scopes the list to the member accessible projects via the shared sub-router', async () => {
    const uiApi = {
      loadUserContext: vi.fn().mockResolvedValue({
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
      listAllProjectsWithTenants: vi.fn(),
      listProjectsWithTenantsForUser: vi.fn().mockResolvedValue(page),
    };

    const response = await dispatchUiRequest({ uiApi, projectTenant }, 'get', '/projects');
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(projectTenant.listProjectsWithTenantsForUser).toHaveBeenCalledWith(
      1,
      25,
      { search: undefined, type: undefined },
      'user-123',
    );
    expect(projectTenant.listAllProjectsWithTenants).not.toHaveBeenCalled();
    expect(payload).toEqual(page);
  });

  it('lists every project for an admin session', async () => {
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
      loadUserContext: vi.fn().mockResolvedValue({
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
      listAllProjectsWithTenants: vi.fn().mockResolvedValue(page),
      listProjectsWithTenantsForUser: vi.fn(),
    };

    const response = await dispatchUiRequest({ uiApi, projectTenant }, 'get', '/projects');
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(projectTenant.listAllProjectsWithTenants).toHaveBeenCalledWith(1, 25, {
      search: undefined,
      type: undefined,
    });
    expect(projectTenant.listProjectsWithTenantsForUser).not.toHaveBeenCalled();
    expect(payload).toEqual(page);
  });

  it('returns 401 when unauthenticated', async () => {
    getUiSessionMock.mockResolvedValue(null);

    const projectTenant = {
      listProjectsWithTenantsForUser: vi.fn(),
    };

    const response = await dispatchUiRequest({ projectTenant }, 'get', '/projects');

    expect(response.status).toBe(401);
    expect(projectTenant.listProjectsWithTenantsForUser).not.toHaveBeenCalled();
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

describe('/ui-api/admin/* mount guards', () => {
  async function dispatchAdminRequest(
    services: Record<string, unknown>,
    method: 'get' | 'put',
    path: string,
    body?: Record<string, unknown>,
  ) {
    const express = (await import('express')).default;
    const app = express();
    app.use(express.json());
    app.use(
      '/ui-api',
      buildUiApiRouter({
        services: { tenant: mockTenantService, featureFlag: mockFeatureFlagService, ...services },
      } as any),
    );
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    try {
      const { port } = server.address() as { port: number };
      return await fetch(`http://127.0.0.1:${port}/ui-api${path}`, {
        method: method.toUpperCase(),
        headers: { authorization: 'Bearer ui-test-token', 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  function makeContextService(roleSlug: string | null) {
    return {
      loadUserContext: vi.fn().mockResolvedValue({
        n8nUser:
          roleSlug === null
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

  it('rejects a member (non-admin role) from the projects list before the service runs', async () => {
    const projectTenant = { listAllProjectsWithTenants: vi.fn() };
    const response = await dispatchAdminRequest(
      { uiApi: makeContextService('global:member'), projectTenant },
      'get',
      '/admin/projects',
    );

    expect(response.status).toBe(403);
    expect(projectTenant.listAllProjectsWithTenants).not.toHaveBeenCalled();
  });

  it('rejects a member (non-admin role) from the rate-limit update endpoint before the service runs', async () => {
    const projectRateLimit = { updateRateLimit: vi.fn() };
    const response = await dispatchAdminRequest(
      { uiApi: makeContextService('global:member'), projectRateLimit },
      'put',
      '/admin/projects/proj-1/rate-limit',
      { weeklyRateLimit: 10, yearlyRateLimit: null, lastAdminComment: null, stopBehavior: 'hard_stop' },
    );

    expect(response.status).toBe(403);
    expect(projectRateLimit.updateRateLimit).not.toHaveBeenCalled();
  });

  it('rejects a role-less identity at the permission guard before the service runs', async () => {
    const projectTenant = { listAllProjectsWithTenants: vi.fn() };
    const response = await dispatchAdminRequest(
      { uiApi: makeContextService(null), projectTenant },
      'get',
      '/admin/projects',
    );

    expect(response.status).toBe(403);
    expect(projectTenant.listAllProjectsWithTenants).not.toHaveBeenCalled();
  });
});
