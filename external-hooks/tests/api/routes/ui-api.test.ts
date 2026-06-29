import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getUiSessionMock,
  getUiOidcIdTokenMock,
  deleteUiOidcTokensMock,
  fetchOidcDiscoveryDocumentMock,
  getOidcConfigFromEnvMock,
} = vi.hoisted(() => ({
  getUiSessionMock: vi.fn(),
  getUiOidcIdTokenMock: vi.fn(),
  deleteUiOidcTokensMock: vi.fn(),
  fetchOidcDiscoveryDocumentMock: vi.fn(),
  getOidcConfigFromEnvMock: vi.fn(),
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
  const servicesWithDefaults = { tenant: mockTenantService, ...services };
  const router = buildUiApiRouter({ services: servicesWithDefaults } as any);
  await runRoute(router, method, path, req, res);
}

beforeEach(() => {
  mockTenantService.getTenantRolesForSession.mockReset();
  mockTenantService.getTenantGroupsForSession.mockReset();
  mockTenantService.getTenantRolesForSession.mockResolvedValue({ roles: [] });
  mockTenantService.getTenantGroupsForSession.mockResolvedValue({ groups: [] });
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
          canRequestAccess: false,
          canReviewAccessRequests: false,
          canShareWorkflows: true,
          canUnshareWorkflows: false,
        },
      }),
    );
  });
});

describe('GET /ui-api/auth/logout', () => {
  it('deletes stored tokens and redirects to the end session endpoint when available', async () => {
    getUiOidcIdTokenMock.mockResolvedValue('id-token-hint');
    fetchOidcDiscoveryDocumentMock.mockResolvedValue({
      end_session_endpoint: 'https://issuer.example.com/logout',
    });

    const router = buildUiApiRouter({ services: {} } as any);
    const req = createMockRequest({ query: { email: 'person@example.com', returnTo: 'https://app.example.com/ui/' } });
    const res = createMockResponse();

    await runRoute(router, 'get', '/auth/logout', req as any, res as any);

    expect(getUiOidcIdTokenMock).toHaveBeenCalledWith('person@example.com');
    expect(deleteUiOidcTokensMock).toHaveBeenCalledWith('person@example.com');
    expect(res.redirect).toHaveBeenCalledWith(
      'https://issuer.example.com/logout?post_logout_redirect_uri=https%3A%2F%2Fapp.example.com%2Fui%2F&id_token_hint=id-token-hint',
    );
  });

  it('deletes stored tokens and falls back to the return URL when no end session endpoint exists', async () => {
    getUiOidcIdTokenMock.mockResolvedValue('id-token-hint');
    fetchOidcDiscoveryDocumentMock.mockResolvedValue({});

    const router = buildUiApiRouter({ services: {} } as any);
    const req = createMockRequest({ query: { email: 'person@example.com', returnTo: 'https://app.example.com/ui/' } });
    const res = createMockResponse();

    await runRoute(router, 'get', '/auth/logout', req as any, res as any);

    expect(deleteUiOidcTokensMock).toHaveBeenCalledWith('person@example.com');
    expect(res.redirect).toHaveBeenCalledWith('https://app.example.com/ui/');
  });

  it('uses endSessionEndpoint from config when discovery document has no end_session_endpoint', async () => {
    getUiOidcIdTokenMock.mockResolvedValue('id-token-hint');
    fetchOidcDiscoveryDocumentMock.mockResolvedValue({});
    getOidcConfigFromEnvMock.mockReturnValue({
      issuerUrl: '',
      authorizationEndpoint: '',
      tokenEndpoint: '',
      userinfoEndpoint: '',
      jwksUri: '',
      endSessionEndpoint: 'https://issuer.example.com/logout',
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      scopes: 'openid email profile',
    });

    const router = buildUiApiRouter({ services: {} } as any);
    const req = createMockRequest({ query: { email: 'person@example.com', returnTo: 'https://app.example.com/ui/' } });
    const res = createMockResponse();

    await runRoute(router, 'get', '/auth/logout', req as any, res as any);

    expect(getUiOidcIdTokenMock).toHaveBeenCalledWith('person@example.com');
    expect(deleteUiOidcTokensMock).toHaveBeenCalledWith('person@example.com');
    expect(res.redirect).toHaveBeenCalledWith(
      'https://issuer.example.com/logout?post_logout_redirect_uri=https%3A%2F%2Fapp.example.com%2Fui%2F&id_token_hint=id-token-hint',
    );
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
          canRequestAccess: false,
          canReviewAccessRequests: false,
          canShareWorkflows: true,
          canUnshareWorkflows: false,
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

describe('GET /ui-api/projects', () => {
  it('returns user project tenants from projectTenant service', async () => {
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
    const projectTenant = {
      listUserProjectTenants: vi.fn().mockResolvedValue([
        { tenantId: '550e8400-e29b-41d4-a716-446655440000', tenantName: 'My Org', projectId: 'abc-123' },
        { tenantId: '660e8400-e29b-41d4-a716-446655440000', tenantName: 'My Personal Project', projectId: 'def-456' },
      ]),
    };
    const req = createMockRequest({
      headers: { authorization: 'Bearer test-access-token' }, // pragma: allowlist secret
      get: vi.fn((name: string) => {
        if (name.toLowerCase() === 'authorization') return 'Bearer test-access-token'; // pragma: allowlist secret
        return undefined;
      }) as any,
    });
    const res = createMockResponse();

    await runProtectedRoute({ uiApi, projectTenant }, 'get', '/projects', req as any, res as any);

    expect(projectTenant.listUserProjectTenants).toHaveBeenCalledWith({
      ssoUserId: 'sub-1',
      n8nUserId: 'user-123',
      accessToken: 'test-access-token', // pragma: allowlist secret
    });
    expect(res.json).toHaveBeenCalledWith({
      data: [
        { tenantId: '550e8400-e29b-41d4-a716-446655440000', tenantName: 'My Org', projectId: 'abc-123' },
        { tenantId: '660e8400-e29b-41d4-a716-446655440000', tenantName: 'My Personal Project', projectId: 'def-456' },
      ],
    });
  });

  it('returns 401 when unauthenticated', async () => {
    getUiSessionMock.mockResolvedValue(null);

    const uiApi = {
      loadUserContext: vi.fn(),
    };
    const projectTenant = {
      listUserProjectTenants: vi.fn(),
    };
    const req = createMockRequest({ get: vi.fn(() => undefined) as any });
    const res = createMockResponse();

    await runProtectedRoute({ uiApi, projectTenant }, 'get', '/projects', req as any, res as any);

    expect(projectTenant.listUserProjectTenants).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
