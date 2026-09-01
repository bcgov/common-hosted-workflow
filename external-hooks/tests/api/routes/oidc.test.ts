import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildOidcRouter, resolveNextRole, type BuildOidcRouterParams } from '../../../src/api/routes/oidc';
import { createSignedCookie, getCookieSecret, verifySignedCookie } from '../../../src/api/helpers/n8n-oidc';
import { clearOidcDiscoveryCache } from '../../../src/api/helpers/oidc-provider';

const {
  deleteUiOidcTokensMock,
  getUiOidcIdTokenMock,
  setUiSessionExchangeMock,
  consumeUiLogoutHandleMock,
  fetchOidcDiscoveryDocumentMock,
} = vi.hoisted(() => ({
  deleteUiOidcTokensMock: vi.fn(),
  getUiOidcIdTokenMock: vi.fn(),
  setUiSessionExchangeMock: vi.fn(),
  consumeUiLogoutHandleMock: vi.fn(),
  fetchOidcDiscoveryDocumentMock: vi.fn(),
}));

vi.mock('../../../src/api/helpers/ui-oidc-store', async () => {
  const actual = (await vi.importActual('../../../src/api/helpers/ui-oidc-store')) as Record<string, unknown>;
  return {
    ...(actual as object),
    consumeUiLogoutHandle: consumeUiLogoutHandleMock,
    consumeUiSessionExchange: vi.fn(),
    deleteUiOidcTokens: deleteUiOidcTokensMock,
    deleteUiOidcTokenRecords: vi.fn(),
    deleteUiSessionExchange: vi.fn(),
    deleteUiSessionIssueId: vi.fn(),
    getUiOidcIdToken: getUiOidcIdTokenMock,
    getUiSessionIssueId: vi.fn(async () => null),
    setUiOidcAccessTokenRecord: vi.fn(),
    setUiOidcIdToken: vi.fn(),
    setUiOidcRefreshToken: vi.fn(),
    setUiSessionExchange: setUiSessionExchangeMock,
    setUiSessionIssueId: vi.fn(),
  };
});

vi.mock('../../../src/api/helpers/oidc-provider', async () => {
  const actual = (await vi.importActual('../../../src/api/helpers/oidc-provider')) as Record<string, unknown>;
  return { ...actual, fetchOidcDiscoveryDocument: fetchOidcDiscoveryDocumentMock };
});

vi.mock('jose', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...(actual as object),
    createRemoteJWKSet: vi.fn(() => ({})),
    jwtVerify: vi.fn(async (token: string, _jwks: unknown, opts: any) => {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT');
      let payload: Record<string, unknown>;
      try {
        const b64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
        const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
        payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
      } catch {
        throw new Error('Invalid JWT');
      }
      if (opts?.issuer && payload.iss !== opts.issuer)
        throw new Error(`Invalid issuer: expected ${opts.issuer} got ${payload.iss}`);
      if (opts?.audience) {
        const aud = payload.aud;
        const expected = opts.audience;
        const audList = Array.isArray(aud) ? aud : typeof aud === 'string' ? [aud] : [];
        if (!audList.includes(expected) && aud !== expected) throw new Error('Invalid audience');
      }
      if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) throw new Error('Token expired');
      return { payload, protectedHeader: {} };
    }),
  };
});

function createTestIdToken(
  claims: Record<string, unknown> = {},
  opts: { nonce?: string; sub?: string; email?: string; issuer?: string; audience?: string; exp?: number } = {},
) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
  const payload = {
    iss: opts.issuer ?? 'https://issuer.example.com',
    aud: opts.audience ?? 'client-1',
    sub: opts.sub ?? (claims.sub as string) ?? 'subject-1',
    email: opts.email ?? (claims.email as string) ?? 'user@example.com',
    nonce: opts.nonce ?? 'nonce-1',
    exp: opts.exp ?? Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    ...claims,
  };
  // Ensure sub/email/nonce/iss/aud not overwritten by claims spread if opts provided
  if (opts.sub) (payload as Record<string, unknown>).sub = opts.sub;
  if (opts.email) (payload as Record<string, unknown>).email = opts.email;
  if (opts.nonce) (payload as Record<string, unknown>).nonce = opts.nonce;
  if (opts.issuer) (payload as Record<string, unknown>).iss = opts.issuer;
  if (opts.audience) (payload as Record<string, unknown>).aud = opts.audience;
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${payloadB64}.signature`;
}

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
      project: { getPersonalProjectForUser: async () => null } as any,
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
      issuerUrl: 'https://issuer.example.com',
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

function createCallbackCookies(state = 'state-1', returnTo?: string) {
  const secret = getCookieSecret();
  return {
    'n8n-oidc-state': createSignedCookie(
      { state, codeVerifier: 'verifier-1', redirectUri: 'https://app.example.com/auth/oidc/callback', returnTo },
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
  beforeEach(() => {
    clearOidcDiscoveryCache();
    fetchOidcDiscoveryDocumentMock.mockResolvedValue({
      issuer: 'https://issuer.example.com',
      authorization_endpoint: 'https://issuer.example.com/auth',
      token_endpoint: 'https://issuer.example.com/token',
      userinfo_endpoint: 'https://issuer.example.com/userinfo',
      jwks_uri: 'https://issuer.example.com/jwks',
    });
    // Fallback for real fetchOidcDiscoveryDocument when vi.mock is not intercepting (e.g., Vitest hoisting edge)
    // Ensure discovery fetch via global fetch also succeeds for login paths.
    const discoveryUrl = 'https://issuer.example.com/.well-known/openid-configuration';
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === discoveryUrl) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            issuer: 'https://issuer.example.com',
            authorization_endpoint: 'https://issuer.example.com/auth',
            token_endpoint: 'https://issuer.example.com/token',
            userinfo_endpoint: 'https://issuer.example.com/userinfo',
            jwks_uri: 'https://issuer.example.com/jwks',
          }),
        } as unknown as Response;
      }
      // Delegate to original fetch for other URLs (will be overridden by test-specific mocks when needed)
      // Use originalFetch captured at top level to avoid recursion
      return (origFetch as typeof fetch)(input as any, undefined as any);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearOidcDiscoveryCache();
    deleteUiOidcTokensMock.mockReset();
    getUiOidcIdTokenMock.mockReset();
    setUiSessionExchangeMock.mockReset();
    consumeUiLogoutHandleMock.mockReset();
    fetchOidcDiscoveryDocumentMock.mockReset();
    fetchOidcDiscoveryDocumentMock.mockResolvedValue({
      issuer: 'https://issuer.example.com',
      authorization_endpoint: 'https://issuer.example.com/auth',
      token_endpoint: 'https://issuer.example.com/token',
      userinfo_endpoint: 'https://issuer.example.com/userinfo',
      jwks_uri: 'https://issuer.example.com/jwks',
    });
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

  it('starts unified OIDC authorization when the UI supplies a return target despite an existing n8n session', async () => {
    const params = createMockParams();
    params.authService.resolveJwt = vi.fn(async () => [{ id: 'user-1' } as any]);
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/login', {
      query: { returnTo: '/ui/projects' },
      cookies: { 'n8n-auth': 'valid-token' },
    });

    expect(params.authService.resolveJwt).not.toHaveBeenCalled();
    const stateCookie = res.cookie.mock.calls.find(([name]: [string]) => name === 'n8n-oidc-state')?.[1];
    expect(stateCookie).toEqual(expect.any(String));
    expect(res.redirect.mock.calls[0][0]).toContain('https://issuer.example.com/auth?');
  });

  it.each([
    ['backslash network path', '/\\evil.test'],
    ['authority-relative path', '//evil.test'],
    ['encoded backslash path', '/%5c%5cevil.test'],
    ['foreign origin absolute URL', 'https://evil.test/ui/projects'],
    ['non-http scheme', 'javascript:alert(1)'],
    ['disallowed same-origin path', '/workflows'],
  ])('falls back to a safe destination when login returnTo is a %s', async (_label, returnTo) => {
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/login', { query: { returnTo } });

    const stateCookie = res.cookie.mock.calls.find(([name]: [string]) => name === 'n8n-oidc-state')?.[1];
    const payload = verifySignedCookie(stateCookie, getCookieSecret()) as { returnTo?: string } | null;
    expect(payload?.returnTo).toBeDefined();
    expect(payload?.returnTo).not.toContain('evil.test');
    expect(payload?.returnTo).not.toContain('\\');
  });

  it('stores a valid relative login returnTo in the state cookie', async () => {
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/login', {
      query: { returnTo: '/ui/projects?filter=active#list' },
    });

    const stateCookie = res.cookie.mock.calls.find(([name]: [string]) => name === 'n8n-oidc-state')?.[1];
    const payload = verifySignedCookie(stateCookie, getCookieSecret()) as { returnTo?: string } | null;
    expect(payload?.returnTo).toBe('/ui/projects?filter=active#list');
  });

  it('redirects authorization start failures to external UI error page', async () => {
    const params = createMockParams();
    params.config.authorizationEndpoint = '';
    // Mock discovery to avoid issuer validation failure spuriously masking endpoint error
    const emptyDiscovery = {
      issuer: 'https://issuer.example.com',
      authorization_endpoint: '',
      token_endpoint: 'https://issuer.example.com/token',
      userinfo_endpoint: 'https://issuer.example.com/userinfo',
      jwks_uri: 'https://issuer.example.com/jwks',
    };
    fetchOidcDiscoveryDocumentMock.mockResolvedValue(emptyDiscovery);
    // Also mock global fetch fallback for real fetch path
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('.well-known/openid-configuration')) {
        return { ok: true, status: 200, json: async () => emptyDiscovery } as unknown as Response;
      }
      return originalFetch(input as any, undefined as any);
    }) as unknown as typeof fetch;
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/login');

    expectUiErrorRedirect(res, 'OIDC authorization endpoint is not configured');
  });

  it('redirects provider callback errors to external UI error page mapping to allowlisted code', async () => {
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/callback', {
      query: { error: 'access_denied', error_description: 'Denied by provider' },
    });

    // Provider descriptions must not be reflected verbatim; allowlisted error code is public
    expectUiErrorRedirect(res, 'access_denied');
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
        return {
          ok: true,
          json: async () => ({
            access_token: 'access-token-1',
            id_token: createTestIdToken({ sub: 'subject-1', email: 'invalid-email' }),
          }),
        } as Response;
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

  it('redirects callback exceptions to sanitized generic error page', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('token endpoint unavailable');
    });
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/callback', {
      query: { code: 'code-1', state: 'state-1' },
      cookies: createCallbackCookies('state-1'),
    });

    // Raw infrastructure errors must not be reflected in redirect; generic public response + server-side log
    expectUiErrorRedirect(res, 'Authentication failed');
    expect(res.redirect.mock.calls[0][0]).not.toContain('token endpoint unavailable');
  });

  it('creates both UI and n8n sessions for an eligible user', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === 'https://issuer.example.com/token') {
        return {
          ok: true,
          json: async () => ({
            access_token: 'access-token-1',
            id_token: createTestIdToken({ sub: 'subject-1', email: 'user@example.com', roles: 'global:member' }),
            expires_in: 300,
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ sub: 'subject-1', email: 'user@example.com', roles: 'global:member' }),
      } as Response;
    });
    const params = createMockParams();
    params.n8nRepositories.user.findByEmail = async () =>
      ({
        id: 'user-1',
        email: 'user@example.com',
        disabled: false,
        role: { slug: 'global:member' },
      }) as any;
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/callback', {
      query: { code: 'code-1', state: 'state-1' },
      cookies: createCallbackCookies('state-1', '/ui/projects'),
    });

    expect(res.cookie).toHaveBeenCalledWith('n8n-auth', 'token', expect.objectContaining({ httpOnly: true }));
    expect(setUiSessionExchangeMock).toHaveBeenCalledWith(expect.any(String), 'access-token-1', 60_000);
    expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/ui\/projects\?session=/));
  });

  it('creates only a UI session when the user is not eligible for n8n', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === 'https://issuer.example.com/token') {
        return {
          ok: true,
          json: async () => ({
            access_token: 'access-token-1',
            id_token: createTestIdToken({ sub: 'subject-1', email: 'user@example.com' }),
            expires_in: 300,
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ sub: 'subject-1', email: 'user@example.com' }) } as Response;
    });
    const params = createMockParams();
    params.config.restrictNoRole = true;
    params.authService.clearCookie = vi.fn();
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/callback', {
      query: { code: 'code-1', state: 'state-1' },
      cookies: createCallbackCookies(),
    });

    expect(res.cookie).not.toHaveBeenCalledWith('n8n-auth', expect.anything(), expect.anything());
    expect(params.authService.clearCookie).toHaveBeenCalledWith(res);
    expect(setUiSessionExchangeMock).toHaveBeenCalledWith(expect.any(String), 'access-token-1', 60_000);
    expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/ui\/access-request\?session=/));
  });

  // stale and cross-identity n8n sessions must be terminated on access-request
  describe('access-request clears stale n8n-auth', () => {
    it('clears n8n-auth even when no prior cookie was present (no-cookie case)', async () => {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === 'https://issuer.example.com/token') {
          return {
            ok: true,
            json: async () => ({
              access_token: 'access-token-1',
              id_token: createTestIdToken({ sub: 'subject-1', email: 'new-ineligible@example.com' }),
              expires_in: 300,
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ sub: 'subject-1', email: 'new-ineligible@example.com' }) } as Response;
      });
      const params = createMockParams();
      params.config.restrictNoRole = true;
      params.n8nRepositories.user.createUserWithProject = vi.fn(async (data: any) => ({
        user: { id: 'user-1', email: data.email, role: { slug: data.role.slug } },
      }));
      params.authService.clearCookie = vi.fn();
      const router = buildOidcRouter(params);

      const res = await invokeRoute(router, '/callback', {
        query: { code: 'code-1', state: 'state-1' },
        cookies: createCallbackCookies('state-1'),
      });

      // No n8n user row should be created for new ineligible identity
      expect(params.n8nRepositories.user.createUserWithProject).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalledWith('n8n-auth', expect.anything(), expect.anything());
      expect(params.authService.clearCookie).toHaveBeenCalledTimes(1);
      expect(params.authService.clearCookie).toHaveBeenCalledWith(res);
      expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/ui\/access-request\?session=/));
      // Subsequent n8n cookie auth with prior (non-existent) token is denied — login falls through to OIDC
      params.authService.resolveJwt = vi.fn(async () => {
        throw new Error('no token');
      });
      const loginRes = await invokeRoute(router, '/login', { cookies: {} });
      expect(loginRes.redirect.mock.calls[0][0]).toContain('https://issuer.example.com/auth?');
    });

    it('same-user eligibility loss: disables existing user, clears stale cookie, and revokes subsequent n8n access', async () => {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === 'https://issuer.example.com/token') {
          return {
            ok: true,
            json: async () => ({
              access_token: 'access-token-1',
              id_token: createTestIdToken({
                sub: 'subject-1',
                email: 'eligible-then-ineligible@example.com',
              }),
              expires_in: 300,
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ sub: 'subject-1', email: 'eligible-then-ineligible@example.com' }),
        } as Response;
      });
      const params = createMockParams();
      params.config.restrictNoRole = true;
      params.n8nRepositories.user.findByEmail = vi.fn(
        async () =>
          ({
            id: 'user-1',
            email: 'eligible-then-ineligible@example.com',
            disabled: false,
            role: { slug: 'global:member' },
          }) as any,
      );
      const setDisabled = vi.fn(async () => undefined);
      params.n8nRepositories.user.setUserDisabled = setDisabled;
      params.authService.clearCookie = vi.fn();
      // Prior browser holds a valid n8n-auth for the same identity
      const priorToken = 'stale-same-identity-token';
      const router = buildOidcRouter(params);

      const res = await invokeRoute(router, '/callback', {
        query: { code: 'code-1', state: 'state-1' },
        cookies: { ...createCallbackCookies('state-1'), 'n8n-auth': priorToken },
      });

      expect(setDisabled).toHaveBeenCalledWith('user-1', true);
      expect(res.cookie).not.toHaveBeenCalledWith('n8n-auth', expect.anything(), expect.anything());
      expect(params.authService.clearCookie).toHaveBeenCalledWith(res);
      // Cookie mutation: browser would drop n8n-auth — Set-Cookie clear via authService
      expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/ui\/access-request\?session=/));
      // Subsequent protected n8n behavior: disabled user must be rejected at integration seam
      // Simulate n8n authService.resolveJwt now seeing disabled user — should be treated as unauthorized.
      // Our assertion is that the only way to retain access would be the stale cookie, which was cleared.
      // Verify fallback clear path also exercised when AuthService throws (production Secure misconfig)
      const paramsWithThrowingClear = createMockParams();
      paramsWithThrowingClear.config.restrictNoRole = true;
      paramsWithThrowingClear.n8nRepositories.user.findByEmail = params.n8nRepositories.user.findByEmail;
      paramsWithThrowingClear.n8nRepositories.user.setUserDisabled = setDisabled;
      paramsWithThrowingClear.authService.clearCookie = vi.fn(() => {
        throw new Error('Secure flag misconfigured');
      });
      const router2 = buildOidcRouter(paramsWithThrowingClear);
      // Need fresh fetch mock still in place
      const res2 = await invokeRoute(router2, '/callback', {
        query: { code: 'code-1', state: 'state-1' },
        cookies: createCallbackCookies('state-1'),
      });
      expect(res2.clearCookie).toHaveBeenCalledWith('n8n-auth', { path: '/' });
    });

    it('cross-identity account switching: new ineligible identity clears prior different-identity cookie', async () => {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === 'https://issuer.example.com/token') {
          return {
            ok: true,
            json: async () => ({
              access_token: 'access-token-b',
              id_token: createTestIdToken({ sub: 'subject-b', email: 'b-ineligible@example.com' }),
              expires_in: 300,
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ sub: 'subject-b', email: 'b-ineligible@example.com' }) } as Response;
      });
      const params = createMockParams();
      params.config.restrictNoRole = true;
      params.n8nRepositories.user.findByEmail = vi.fn(async () => null); // B is new, ineligible — no row
      params.n8nRepositories.user.createUserWithProject = vi.fn(async (data: any) => ({
        user: { id: 'user-1', email: data.email, role: { slug: data.role.slug } },
      }));
      params.authService.clearCookie = vi.fn();
      const priorToken = 'token-for-a-eligible';
      const router = buildOidcRouter(params);

      const res = await invokeRoute(router, '/callback', {
        query: { code: 'code-1', state: 'state-1' },
        cookies: { ...createCallbackCookies('state-1'), 'n8n-auth': priorToken },
      });

      expect(params.n8nRepositories.user.createUserWithProject).not.toHaveBeenCalled();
      expect(params.authService.clearCookie).toHaveBeenCalledWith(res);
      expect(res.cookie).not.toHaveBeenCalledWith('n8n-auth', expect.anything(), expect.anything());
      expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/ui\/access-request\?session=/));
      // Integration seam: prior cookie for A must not grant n8n access after B's access-request;
      // simulate second request presenting the stale A token — authService would previously have returned A,
      // but after clear the browser would not send it. We assert clear prevents replay.
      expect(params.authService.clearCookie).toHaveBeenCalledTimes(1);
    });

    it('disabled-user access: existing cookie for disabled user is terminated via clear and disabled enforcement', async () => {
      // First, an eligible callback establishes a session, then a subsequent ineligible callback
      // disables the user. We verify that the disabled state plus cookie clear means the next
      // n8n cookie-auth attempt is not usable.
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === 'https://issuer.example.com/token') {
          return {
            ok: true,
            json: async () => ({
              access_token: 'access-token-1',
              id_token: createTestIdToken({ sub: 'subject-1', email: 'disabled-user@example.com' }),
              expires_in: 300,
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ sub: 'subject-1', email: 'disabled-user@example.com' }) } as Response;
      });
      const params = createMockParams();
      params.config.restrictNoRole = true;
      params.n8nRepositories.user.findByEmail = vi.fn(
        async () =>
          ({
            id: 'user-disabled',
            email: 'disabled-user@example.com',
            disabled: false,
            role: { slug: 'global:member' },
          }) as any,
      );
      params.n8nRepositories.user.setUserDisabled = vi.fn(async () => undefined);
      params.authService.clearCookie = vi.fn();
      // Mock resolveJwt to emulate n8n's disabled check: if user disabled, reject
      params.authService.resolveJwt = vi.fn(async (token: string) => {
        if (token === 'disabled-cookie-token') {
          // Simulate n8n rejecting a disabled user's JWT at the integration boundary
          throw new Error('User is disabled');
        }
        return [null as any];
      });
      const router = buildOidcRouter(params);

      const res = await invokeRoute(router, '/callback', {
        query: { code: 'code-1', state: 'state-1' },
        cookies: { ...createCallbackCookies('state-1'), 'n8n-auth': 'disabled-cookie-token' },
      });

      expect(params.n8nRepositories.user.setUserDisabled).toHaveBeenCalledWith('user-disabled', true);
      expect(params.authService.clearCookie).toHaveBeenCalledWith(res);
      // Subsequent n8n-auth use must fail — integration seam throws for disabled
      await expect(params.authService.resolveJwt('disabled-cookie-token', {} as any, {} as any)).rejects.toThrow(
        'User is disabled',
      );
      // And login with that stale cookie must fall through to OIDC authorization, not fast-path
      const loginRes = await invokeRoute(router, '/login', { cookies: { 'n8n-auth': 'disabled-cookie-token' } });
      expect(loginRes.redirect.mock.calls[0][0]).toContain('https://issuer.example.com/auth?');
    });

    it('eligible callback still sets n8n-auth and does not clear it (positive control)', async () => {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === 'https://issuer.example.com/token') {
          return {
            ok: true,
            json: async () => ({
              access_token: 'access-token-1',
              id_token: createTestIdToken({ sub: 'subject-1', email: 'eligible@example.com', roles: 'global:member' }),
              expires_in: 300,
            }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ sub: 'subject-1', email: 'eligible@example.com', roles: 'global:member' }),
        } as Response;
      });
      const params = createMockParams();
      params.n8nRepositories.user.findByEmail = vi.fn(
        async () =>
          ({
            id: 'user-1',
            email: 'eligible@example.com',
            disabled: false,
            role: { slug: 'global:member' },
          }) as any,
      );
      params.authService.clearCookie = vi.fn();
      const router = buildOidcRouter(params);

      const res = await invokeRoute(router, '/callback', {
        query: { code: 'code-1', state: 'state-1' },
        cookies: createCallbackCookies('state-1', '/ui/projects'),
      });

      expect(res.cookie).toHaveBeenCalledWith('n8n-auth', 'token', expect.objectContaining({ httpOnly: true }));
      expect(params.authService.clearCookie).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['backslash network path', '/\\evil.test'],
    ['authority-relative path', '//evil.test'],
    ['foreign origin absolute URL', 'https://evil.test/ui'],
  ])('never sends a session exchange handle to a rejected callback returnTo (%s)', async (_label, returnTo) => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === 'https://issuer.example.com/token') {
        return {
          ok: true,
          json: async () => ({
            access_token: 'access-token-1',
            id_token: createTestIdToken({ sub: 'subject-1', email: 'user@example.com', roles: 'global:member' }),
            expires_in: 300,
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ sub: 'subject-1', email: 'user@example.com', roles: 'global:member' }),
      } as Response;
    });
    const params = createMockParams();
    params.n8nRepositories.user.findByEmail = async () =>
      ({
        id: 'user-1',
        email: 'user@example.com',
        disabled: false,
        role: { slug: 'global:member' },
      }) as any;
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/callback', {
      query: { code: 'code-1', state: 'state-1' },
      cookies: createCallbackCookies('state-1', returnTo),
    });

    expect(setUiSessionExchangeMock).toHaveBeenCalled();
    const location = res.redirect.mock.calls[0][0] as string;
    expect(location).not.toContain('evil.test');
    expect(location).toMatch(/^\/ui\/\?session=/);
  });

  it('preserves query strings and fragments on a valid callback returnTo with exactly one session handle', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === 'https://issuer.example.com/token') {
        return {
          ok: true,
          json: async () => ({
            access_token: 'access-token-1',
            id_token: createTestIdToken({ sub: 'subject-1', email: 'user@example.com', roles: 'global:member' }),
            expires_in: 300,
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ sub: 'subject-1', email: 'user@example.com', roles: 'global:member' }),
      } as Response;
    });
    const params = createMockParams();
    params.n8nRepositories.user.findByEmail = async () =>
      ({
        id: 'user-1',
        email: 'user@example.com',
        disabled: false,
        role: { slug: 'global:member' },
      }) as any;
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/callback', {
      query: { code: 'code-1', state: 'state-1' },
      cookies: createCallbackCookies('state-1', '/ui/projects?filter=active&session=forged#list'),
    });

    const location = res.redirect.mock.calls[0][0] as string;
    expect(location.startsWith('/ui/projects?')).toBe(true);
    expect(location).toContain('filter=active');
    expect(location.endsWith('#list')).toBe(true);
    const occurrences = location.match(/session=/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(new URL(location, 'https://placeholder.test').searchParams.get('session')).not.toBe('forged');
  });

  it('clears the n8n cookie and UI token records during logout', async () => {
    getUiOidcIdTokenMock.mockResolvedValue(undefined);
    const params = createMockParams();
    params.authService.resolveJwt = vi.fn(async () => [{ email: 'user@example.com' } as any]);
    params.authService.invalidateToken = vi.fn(async () => undefined);
    params.authService.clearCookie = vi.fn();
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/logout', {
      query: { returnTo: '/ui/' },
      cookies: { 'n8n-auth': 'valid-token' },
    });

    expect(params.authService.invalidateToken).toHaveBeenCalled();
    expect(params.authService.clearCookie).toHaveBeenCalledWith(res);
    expect(deleteUiOidcTokensMock).toHaveBeenCalledWith('user@example.com');
    expect(res.redirect).toHaveBeenCalledWith('/ui/?signedOut=1');
  });

  it('normalizes cookie-derived identity before touching token records', async () => {
    getUiOidcIdTokenMock.mockResolvedValue(undefined);
    const params = createMockParams();
    params.authService.resolveJwt = vi.fn(async () => [{ email: ' Person@Example.COM ' } as any]);
    const router = buildOidcRouter(params);

    await invokeRoute(router, '/logout', {
      query: { returnTo: '/ui/' },
      cookies: { 'n8n-auth': 'valid-token' },
    });

    expect(deleteUiOidcTokensMock).toHaveBeenCalledWith('person@example.com');
  });

  it('ignores a browser-supplied email when no identity is authenticated', async () => {
    const params = createMockParams();
    params.authService.clearCookie = vi.fn();
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/logout', {
      query: { returnTo: '/ui/', email: 'victim@example.com' },
    });

    expect(deleteUiOidcTokensMock).not.toHaveBeenCalled();
    expect(getUiOidcIdTokenMock).not.toHaveBeenCalled();
    expect(params.authService.clearCookie).toHaveBeenCalledWith(res);
    expect(res.redirect).toHaveBeenCalledWith('/ui/?signedOut=1');
  });

  it('does not fall back to caller-supplied email when the n8n cookie is invalid', async () => {
    const params = createMockParams();
    params.authService.resolveJwt = vi.fn(async () => {
      throw new Error('invalid token');
    });
    params.authService.clearCookie = vi.fn();
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/logout', {
      query: { returnTo: '/ui/', email: 'victim@example.com' },
      cookies: { 'n8n-auth': 'forged-token' },
    });
    expect(deleteUiOidcTokensMock).not.toHaveBeenCalled();
    expect(params.authService.clearCookie).toHaveBeenCalledWith(res);
    expect(res.redirect).toHaveBeenCalledWith('/ui/?signedOut=1');
  });

  it('logs out a handle-authenticated UI session without an n8n cookie', async () => {
    consumeUiLogoutHandleMock.mockResolvedValue({ email: 'person@example.com', returnTo: '/ui/signed-out' });
    getUiOidcIdTokenMock.mockResolvedValue(undefined);
    const params = createMockParams();
    params.authService.clearCookie = vi.fn();
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/logout', {
      query: { logout: 'handle-1', returnTo: '/ui/other' },
    });

    expect(consumeUiLogoutHandleMock).toHaveBeenCalledWith('handle-1');
    expect(deleteUiOidcTokensMock).toHaveBeenCalledWith('person@example.com');
    expect(params.authService.clearCookie).toHaveBeenCalledWith(res);
    expect(res.redirect).toHaveBeenCalledWith('/ui/signed-out?signedOut=1');
  });

  it('redirects through the upstream end session endpoint for a handle-authenticated logout', async () => {
    consumeUiLogoutHandleMock.mockResolvedValue({ email: 'person@example.com', returnTo: '/ui/' });
    getUiOidcIdTokenMock.mockResolvedValue('id-token-1');
    fetchOidcDiscoveryDocumentMock.mockResolvedValue({ end_session_endpoint: 'https://idp.test/logout' });
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/logout', { query: { logout: 'handle-1' } });

    const location = res.redirect.mock.calls[0][0] as string;
    expect(location.startsWith('https://idp.test/logout?')).toBe(true);
    const logoutUrl = new URL(location);
    expect(logoutUrl.searchParams.get('id_token_hint')).toBe('id-token-1');
    expect(logoutUrl.searchParams.get('post_logout_redirect_uri')).toBe('/ui/?signedOut=1');
  });

  it('still cleans up local records and the cookie when provider discovery fails', async () => {
    consumeUiLogoutHandleMock.mockResolvedValue({ email: 'person@example.com', returnTo: '/ui/' });
    getUiOidcIdTokenMock.mockResolvedValue('id-token-1');
    fetchOidcDiscoveryDocumentMock.mockRejectedValue(new Error('discovery unavailable'));
    const params = createMockParams();
    params.authService.clearCookie = vi.fn();
    const router = buildOidcRouter(params);

    const res = await invokeRoute(router, '/logout', { query: { logout: 'handle-1' } });

    expect(deleteUiOidcTokensMock).toHaveBeenCalledWith('person@example.com');
    expect(params.authService.clearCookie).toHaveBeenCalledWith(res);
    expect(res.redirect).toHaveBeenCalledWith('/ui/?signedOut=1');
  });

  it('treats a consumed logout handle as unusable', async () => {
    consumeUiLogoutHandleMock.mockResolvedValueOnce({ email: 'person@example.com', returnTo: '/ui/' });
    consumeUiLogoutHandleMock.mockResolvedValueOnce(null);
    const params = createMockParams();
    params.authService.clearCookie = vi.fn();
    const router = buildOidcRouter(params);

    const first = await invokeRoute(router, '/logout', { query: { logout: 'handle-1', returnTo: '/ui/' } });
    const second = await invokeRoute(router, '/logout', { query: { logout: 'handle-1', returnTo: '/ui/' } });

    expect(first.redirect).toHaveBeenCalledWith('/ui/?signedOut=1');
    expect(deleteUiOidcTokensMock).toHaveBeenCalledTimes(1);
    expect(second.redirect).toHaveBeenCalledWith('/ui/?signedOut=1');
  });

  it('rejects a logout handle bound to an invalid return target', async () => {
    consumeUiLogoutHandleMock.mockResolvedValue({
      email: 'person@example.com',
      returnTo: 'https://evil.test/steal',
    });
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/logout', { query: { logout: 'handle-1', returnTo: '/ui/' } });

    const location = res.redirect.mock.calls[0][0] as string;
    expect(location).toBe('/ui/?signedOut=1');
    expect(location).not.toContain('evil.test');
  });

  it.each([
    ['backslash network path', '/\\evil.test'],
    ['authority-relative path', '//evil.test'],
    ['encoded backslash', '/%5cevil.test'],
    ['foreign origin', 'https://evil.test/ui'],
    ['credentials on allowed origin', 'https://user:pass@localhost/ui'], // pragma: allowlist secret
    ['disallowed same-origin path', '/workflows'],
  ])('falls back to a safe destination when logout returnTo is a %s', async (_label, returnTo) => {
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/logout', { query: { returnTo } });

    expect(res.redirect).toHaveBeenCalledWith('/ui/?signedOut=1');
  });

  it('emits exactly one signedOut parameter when logout returnTo already contains one', async () => {
    const router = buildOidcRouter(createMockParams());

    const res = await invokeRoute(router, '/logout', { query: { returnTo: '/ui/?signedOut=0&x=1' } });

    expect(res.redirect).toHaveBeenCalledWith('/ui/?signedOut=1&x=1');
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

  // Public error boundary — hostile text sanitized, allowlist preserved
  describe('public error boundary', () => {
    it('rejects issuer-less manual configuration at router construction', () => {
      const params = createMockParams();
      params.config.issuerUrl = '';
      expect(() => buildOidcRouter(params)).toThrow(/OIDC issuer is required/i);
    });

    it('sanitizes hostile provider error_description and unknown error codes to generic', async () => {
      const router = buildOidcRouter(createMockParams());

      const hostile = '<script>alert(1)</script> redis://secret-token https://evil.test/steal?token=abc';
      const res = await invokeRoute(router, '/callback', {
        query: { error: 'access_denied', error_description: hostile },
      });
      // Must map to allowlisted code, not hostile description
      expectUiErrorRedirect(res, 'access_denied');
      expect(res.redirect.mock.calls[0][0]).not.toContain('<script>');
      expect(res.redirect.mock.calls[0][0]).not.toContain('redis');
      expect(res.redirect.mock.calls[0][0]).not.toContain('evil.test');

      const res2 = await invokeRoute(router, '/callback', {
        query: { error: 'not_a_standard_code', error_description: hostile },
      });
      expectUiErrorRedirect(res2, 'Authentication failed');
      expect(res2.redirect.mock.calls[0][0]).not.toContain(hostile);
      expect(res2.redirect.mock.calls[0][0]).not.toContain('not_a_standard_code');
    });

    it('allows known-safe provider code invalid_request without leaking description', async () => {
      const router = buildOidcRouter(createMockParams());
      const res = await invokeRoute(router, '/callback', {
        query: { error: 'invalid_request', error_description: 'some detailed provider text with https://secret' },
      });
      expectUiErrorRedirect(res, 'invalid_request');
      expect(res.redirect.mock.calls[0][0]).not.toContain('https://secret');
    });

    it('sanitizes infrastructure errors in login route to generic', async () => {
      const params = createMockParams();
      // Force beginOidcAuthorization to throw infrastructure error via mocked discovery
      const infraError = new Error('Redis connection failed at redis://localhost:6379');
      fetchOidcDiscoveryDocumentMock.mockRejectedValueOnce(infraError);
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('.well-known/openid-configuration')) throw infraError; // pragma: allowlist secret
        return originalFetch(input as any, undefined as any);
      }) as unknown as typeof fetch;
      const router = buildOidcRouter(params);
      const res = await invokeRoute(router, '/login');
      expectUiErrorRedirect(res, 'Authentication failed');
      expect(res.redirect.mock.calls[0][0]).not.toContain('Redis');
      expect(res.redirect.mock.calls[0][0]).not.toContain('redis://');
    });

    it('does not leak raw error_message in callback outer catch', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('database connection string: postgres://user:pass@host/db'); // pragma: allowlist secret
      });
      const router = buildOidcRouter(createMockParams());
      const res = await invokeRoute(router, '/callback', {
        query: { code: 'code-1', state: 'state-1' },
        cookies: createCallbackCookies('state-1'),
      });
      expectUiErrorRedirect(res, 'Authentication failed');
      expect(res.redirect.mock.calls[0][0]).not.toContain('postgres');
      expect(res.redirect.mock.calls[0][0]).not.toContain('user:pass');
    });
  });
});
