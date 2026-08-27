import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOidcRouter, resolveNextRole, type BuildOidcRouterParams } from '../../../src/api/routes/oidc';
import { createSignedCookie, getCookieSecret } from '../../../src/api/helpers/n8n-oidc';

const originalFetch = globalThis.fetch;

function createMockUserQueryBuilder() {
  return {
    innerJoin: () => ({
      where: () => ({
        andWhere: () => ({
          getCount: async () => 0,
        }),
      }),
    }),
    where: () => ({}),
    andWhere: () => ({}),
    getCount: async () => 0,
  };
}

function createMockParams(): BuildOidcRouterParams {
  return {
    n8nRepositories: {
      user: {
        findByEmail: async () => null,
        count: async () => 0,
        createQueryBuilder: createMockUserQueryBuilder,
        createUserWithProject: async (userData) => ({
          user: { id: 'user-1', email: userData.email, role: { slug: 'global:owner' } },
        }),
        getUserForApiKey: async () => null,
        metadata: { tableName: 'user', columns: [] },
      },
      project: {} as any,
      projectRelation: {} as any,
      sharedWorkflow: {} as any,
      workflow: {} as any,
      credential: {} as any,
      sharedCredential: {} as any,
      execution: {} as any,
      role: {} as any,
      withTransaction: {} as any,
      raw: {} as any,
    },
    customRepositories: {
      tenantProjectRelation: {
        getTenantIdByProjectId: async () => null,
        insertIgnoreConflict: async () => undefined,
      },
    } as any,
    authService: {
      invalidateToken: async () => undefined,
      clearCookie: () => undefined,
      resolveJwt: async () => [null as any],
    },
    jwtService: {
      sign: () => 'token',
    },
    userService: {
      changeUserRole: async () => undefined,
    },
    tenantProjectSyncService: {
      syncTenantsForUser: async () => undefined,
    },
    cstarService: {
      isConfigured: () => true,
      getUserTenants: async () => [],
      getUserTenantsStrict: async () => [],
      getUserSharedServiceRoles: async () => [],
      getUserSharedServiceRolesStrict: async () => [],
    } as any,
    config: {
      issuerUrl: '',
      authorizationEndpoint: 'https://issuer.example.com/auth',
      tokenEndpoint: 'https://issuer.example.com/token',
      userinfoEndpoint: 'https://issuer.example.com/userinfo',
      jwksUri: 'https://issuer.example.com/jwks',
      endSessionEndpoint: '',
      clientId: 'client-1',
      clientSecret: 'secret-1', // pragma: allowlist secret
      redirectUri: 'https://app.example.com/auth/oidc/callback',
      scopes: 'openid email profile',
      rolesClaim: 'roles',
      restrictNoRole: false,
    },
  };
}

function createMockResponse() {
  const res = {
    redirect: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as any;
  res.redirect.mockReturnValue(res);
  res.cookie.mockReturnValue(res);
  res.clearCookie.mockReturnValue(res);
  return res;
}

async function invokeRoute(
  router: any,
  path: string,
  req: { query?: Record<string, unknown>; cookies?: Record<string, string | undefined> } = {},
) {
  const layer = router.stack.find((item: any) => item.route?.path === path);
  const handler = layer?.route?.stack?.[0]?.handle;
  if (!handler) throw new Error(`Route not found: ${path}`);

  const res = createMockResponse();
  await handler({ query: {}, cookies: {}, ...req }, res, vi.fn());
  return res;
}

function createCallbackCookies(state = 'state-1') {
  const secret = getCookieSecret();
  return {
    'n8n-oidc-state': createSignedCookie(
      { state, codeVerifier: 'verifier-1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      secret,
    ),
    'n8n-oidc-nonce': createSignedCookie({ nonce: 'nonce-1' }, secret),
  };
}

function expectUiErrorRedirect(res: any, message: string) {
  expect(res.redirect).toHaveBeenCalledWith('/ui?error=' + encodeURIComponent(message));
}

function getRoutePaths(router: { stack: Array<{ route?: { path?: string } }> }) {
  return router.stack
    .map((layer) => layer.route?.path)
    .filter((x): x is string => Boolean(x))
    .sort((left, right) => left.localeCompare(right));
}

describe('oidc router', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('registers login, callback, and logout routes', () => {
    const router = buildOidcRouter(createMockParams());

    expect(getRoutePaths(router)).toEqual(['/callback', '/login', '/logout']);
  });

  it('redirects to app when login receives a valid existing n8n session', async () => {
    const params = createMockParams();
    params.authService.resolveJwt = vi.fn(async () => [{ id: 'user-1', email: 'user@example.com' } as any]);
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/login', { cookies: { 'n8n-auth': 'valid-token' } });

    expect(params.authService.resolveJwt).toHaveBeenCalledWith('valid-token', expect.any(Object), res);
    expect(res.redirect).toHaveBeenCalledWith('/');
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('starts OIDC authorization when login has no existing session', async () => {
    const params = createMockParams();
    params.authService.resolveJwt = vi.fn(async () => [{ id: 'user-1' } as any]);
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/login');

    expect(params.authService.resolveJwt).not.toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith('n8n-oidc-state', expect.any(String), expect.any(Object));
    expect(res.cookie).toHaveBeenCalledWith('n8n-oidc-nonce', expect.any(String), expect.any(Object));
    expect(res.redirect.mock.calls[0][0]).toContain('https://issuer.example.com/auth?');
  });

  it('falls back to OIDC authorization when existing n8n session is stale or invalid', async () => {
    const params = createMockParams();
    params.authService.resolveJwt = vi.fn(async () => {
      throw new Error('expired');
    });
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/login', { cookies: { 'n8n-auth': 'stale-token' } });

    expect(params.authService.resolveJwt).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith('n8n-oidc-state', expect.any(String), expect.any(Object));
    expect(res.redirect.mock.calls[0][0]).toContain('https://issuer.example.com/auth?');
  });

  it('redirects authorization start failures to external UI error page', async () => {
    const params = createMockParams();
    params.config.authorizationEndpoint = '';
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/login');

    expectUiErrorRedirect(res, 'OIDC authorization endpoint is not configured');
  });

  it('redirects provider callback errors to external UI error page', async () => {
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/callback', {
      query: { error: 'access_denied', error_description: 'Denied by provider' },
    });

    expectUiErrorRedirect(res, 'Denied by provider');
  });

  it('redirects missing callback params to external UI error page', async () => {
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/callback', { query: { code: 'code-1' } });

    expectUiErrorRedirect(res, 'Missing authorization code or state');
  });

  it('redirects missing state cookies to external UI error page', async () => {
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/callback', { query: { code: 'code-1', state: 'state-1' } });

    expectUiErrorRedirect(res, 'Missing state cookies - session expired');
  });

  it('redirects invalid state cookies to external UI error page', async () => {
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/callback', {
      query: { code: 'code-1', state: 'state-1' },
      cookies: createCallbackCookies('different-state'),
    });

    expectUiErrorRedirect(res, 'Invalid state - possible CSRF attack');
  });

  it('redirects invalid OIDC email to external UI error page', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://issuer.example.com/token') {
        return { ok: true, json: async () => ({ access_token: 'access-token-1' }) } as Response;
      }
      return { ok: true, json: async () => ({ sub: 'subject-1', email: 'invalid-email' }) } as Response;
    });
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/callback', {
      query: { code: 'code-1', state: 'state-1' },
      cookies: createCallbackCookies('state-1'),
    });

    expectUiErrorRedirect(res, 'No valid email in OIDC response');
  });

  it('redirects callback exceptions to external UI error page', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('token endpoint unavailable');
    });
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/callback', {
      query: { code: 'code-1', state: 'state-1' },
      cookies: createCallbackCookies('state-1'),
    });

    expectUiErrorRedirect(res, 'Authentication failed: token endpoint unavailable');
  });

  it('returns global:member when restrictNoRole is false and jwt role is missing', async () => {
    const role = await resolveNextRole({
      jwtRole: null,
      restrictNoRole: false,
      cstarService: createMockParams().cstarService,
      ssoUserId: 'user-1',
      accessToken: 'token',
    });

    expect(role).toBe('global:member');
  });

  it('returns global:member when restrictNoRole is true and CSTAR has a project role', async () => {
    const role = await resolveNextRole({
      jwtRole: null,
      restrictNoRole: true,
      cstarService: {
        isConfigured: () => true,
        getUserTenants: async () => [{ id: 'tenant-1', name: 'Tenant 1' }],
        getUserTenantsStrict: async () => [{ id: 'tenant-1', name: 'Tenant 1' }],
        getUserSharedServiceRoles: async () => [{ name: 'project:viewer' }],
        getUserSharedServiceRolesStrict: async () => [{ name: 'project:viewer' }],
      } as any,
      ssoUserId: 'user-1',
      accessToken: 'token',
    });

    expect(role).toBe('global:member');
  });

  it('returns empty role when restrictNoRole is true and CSTAR has no project roles', async () => {
    const role = await resolveNextRole({
      jwtRole: null,
      restrictNoRole: true,
      cstarService: {
        isConfigured: () => true,
        getUserTenants: async () => [{ id: 'tenant-1', name: 'Tenant 1' }],
        getUserTenantsStrict: async () => [{ id: 'tenant-1', name: 'Tenant 1' }],
        getUserSharedServiceRoles: async () => [{ name: 'ui:actor' }],
        getUserSharedServiceRolesStrict: async () => [{ name: 'ui:actor' }],
      } as any,
      ssoUserId: 'user-1',
      accessToken: 'token',
    });

    expect(role).toBe('');
  });

  it('returns empty role when CSTAR has an unmapped project role', async () => {
    const role = await resolveNextRole({
      jwtRole: null,
      restrictNoRole: true,
      cstarService: {
        isConfigured: () => true,
        getUserTenants: async () => [{ id: 'tenant-1', name: 'Tenant 1' }],
        getUserTenantsStrict: async () => [{ id: 'tenant-1', name: 'Tenant 1' }],
        getUserSharedServiceRoles: async () => [{ name: 'project:auditor' }],
        getUserSharedServiceRolesStrict: async () => [{ name: 'project:auditor' }],
      } as any,
      ssoUserId: 'user-1',
      accessToken: 'token',
    });

    expect(role).toBe('');
  });

  it('throws when CSTAR verification fails', async () => {
    await expect(
      resolveNextRole({
        jwtRole: null,
        restrictNoRole: true,
        cstarService: {
          isConfigured: () => true,
          getUserTenants: async () => [],
          getUserTenantsStrict: async () => {
            throw new Error('boom');
          },
          getUserSharedServiceRoles: async () => [],
          getUserSharedServiceRolesStrict: async () => [],
        } as any,
        ssoUserId: 'user-1',
        accessToken: 'token',
      }),
    ).rejects.toThrow('Unable to verify CSTAR tenant roles during sign-in');
  });

  it('returns jwt role when upstream role is present', async () => {
    const role = await resolveNextRole({
      jwtRole: 'global:admin',
      restrictNoRole: true,
      cstarService: createMockParams().cstarService,
      ssoUserId: 'user-1',
      accessToken: 'token',
    });

    expect(role).toBe('global:admin');
  });
});
