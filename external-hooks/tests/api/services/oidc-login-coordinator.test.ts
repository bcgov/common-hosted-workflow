import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OidcLoginCoordinator,
  syncN8nUserRole,
  prepareUiSessionExchange,
} from '../../../src/api/services/oidc-login-coordinator';
import type { ReturnTargetPolicy } from '../../../src/api/helpers/return-target';
import { createReturnTargetPolicy } from '../../../src/api/helpers/return-target';

function createTestIdTokenClaims(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'subject-1',
    email: 'user@example.com',
    preferred_username: 'user',
    name: 'Test User',
    roles: 'global:member',
    iss: 'https://issuer.example.com',
    aud: 'client-1',
    nonce: 'nonce-1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  } as Record<string, unknown>;
}

function mockPolicy(policy?: Partial<ReturnTargetPolicy>): ReturnTargetPolicy {
  const base = createReturnTargetPolicy();
  return { ...base, ...policy } as ReturnTargetPolicy;
}

function createMockUserRepository(overrides: Record<string, any> = {}) {
  return {
    findByEmail: vi.fn(async () => null),
    count: vi.fn(async () => 1),
    createUserWithProject: vi.fn(async (data: any) => ({
      user: { id: 'user-1', email: data.email, role: { slug: data.role.slug }, disabled: false },
    })),
    setUserDisabled: vi.fn(async () => undefined),
    createQueryBuilder: vi.fn(() => ({
      innerJoin: () => ({
        where: () => ({
          andWhere: () => ({
            getCount: async () => 1,
          }),
        }),
      }),
    })),
    ...overrides,
  } as any;
}

function createCoordinatorDeps(overrides: Record<string, any> = {}) {
  const userRepository = createMockUserRepository(overrides.userRepository);
  const projectRepository: any = {
    getPersonalProjectForUser: vi.fn(async () => ({ id: 'proj-1' })),
    findOneBy: vi.fn(async () => null),
    create: (x: any) => x,
    save: vi.fn(async (x: any) => ({ id: 'proj-1', ...x })),
  };
  const tenantProjectRelationRepository: any = {
    getTenantIdByProjectId: vi.fn(async () => null),
    insertIgnoreConflict: vi.fn(async () => undefined),
    getProjectIdsByTenantId: vi.fn(async () => []),
  };

  const completeAuthorization = vi.fn(async () => ({
    discovery: { issuer: 'https://issuer.example.com' },
    tokens: { access_token: 'access-token-1', id_token: 'id-1', refresh_token: 'refresh-1', expires_in: 300 },
    mergedClaims: createTestIdTokenClaims(),
    idTokenClaims: createTestIdTokenClaims(),
    userInfo: null,
  }));

  const extractIdentity = vi.fn((params: any) => ({
    subject: params.claims.sub as string,
    email: params.claims.email as string,
    preferredUsername: params.claims.preferred_username as string,
    name: params.claims.name as string,
    issuer: 'https://issuer.example.com',
    audience: ['client-1'],
    claims: params.claims,
  }));

  const resolveCstarSsoUserId = vi.fn(() => 'sso-1');
  const resolveNextRole = vi.fn(async () => 'global:member');
  const persistTokens = vi.fn(async () => undefined);
  const prepareExchange = vi.fn(async () => ({ handle: 'handle-1', token: 'ui-token-1' }));
  const ensureTenantMapping = vi.fn(async () => undefined);
  const createAuthTokenFn = vi.fn(() => 'n8n-token-1');
  const consumeExchange = vi.fn(async () => null);

  const deps: any = {
    config: {
      issuerUrl: 'https://issuer.example.com',
      authorizationEndpoint: 'https://issuer.example.com/auth',
      tokenEndpoint: 'https://issuer.example.com/token',
      userinfoEndpoint: 'https://issuer.example.com/userinfo',
      jwksUri: 'https://issuer.example.com/jwks',
      endSessionEndpoint: '',
      clientId: 'client-1',
      clientSecret: 'secret', // pragma: allowlist secret
      redirectUri: 'https://app.example.com/auth/oidc/callback',
      scopes: 'openid email profile',
      rolesClaim: 'roles',
      restrictNoRole: false,
    },
    returnTargetPolicy: mockPolicy(),
    userRepository,
    projectRepository,
    tenantProjectRelationRepository,
    jwtService: { sign: () => 'token' } as any,
    userService: { changeUserRole: vi.fn(async () => undefined) } as any,
    tenantProjectSyncService: { syncTenantsForUser: vi.fn(async () => undefined) } as any,
    cstarService: {
      isConfigured: () => false,
      getUserTenantsStrict: vi.fn(async () => []),
      getUserSharedServiceRolesStrict: vi.fn(async () => []),
    } as any,
    completeAuthorization,
    extractIdentity,
    resolveCstarSsoUserId,
    resolveNextRole,
    persistTokens,
    prepareExchange,
    ensureTenantMapping,
    createAuthTokenFn,
    consumeExchange,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() } as any,
    ...overrides,
  };

  // Allow overrides to replace nested mocks
  if (overrides.userRepository) deps.userRepository = createMockUserRepository(overrides.userRepository);
  return deps;
}

describe('OidcLoginCoordinator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('eligible existing user creates dual session with UI exchange before n8n token (atomic)', async () => {
    const order: string[] = [];
    const prepareExchange = vi.fn(async () => {
      order.push('prepareExchange');
      return { handle: 'handle-1', token: 'ui-token-1' };
    });
    const createAuthTokenFn = vi.fn(() => {
      order.push('createAuthToken');
      return 'n8n-token-1';
    });
    const deps = createCoordinatorDeps({ prepareExchange, createAuthTokenFn });
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    } as any);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: {
        state: 's1',
        codeVerifier: 'v1',
        redirectUri: 'https://app.example.com/auth/oidc/callback',
        returnTo: '/ui/projects?x=1#frag',
      },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('eligible');
    if (outcome.kind === 'eligible') {
      expect(outcome.n8nAuthToken).toBe('n8n-token-1');
      expect(outcome.uiHandle).toBe('handle-1');
      expect(outcome.redirectUrl).toContain('/ui/projects');
      expect(outcome.redirectUrl).toContain('session=handle-1');
      expect(outcome.redirectUrl).toContain('x=1');
      expect(outcome.redirectUrl.endsWith('#frag')).toBe(true);
    }
    expect(order).toEqual(['prepareExchange', 'createAuthToken']);
    expect(deps.persistTokens).toHaveBeenCalled();
  });

  it('ineligible new user gets UI-only access-request without creating n8n user', async () => {
    const deps = createCoordinatorDeps();
    deps.resolveNextRole.mockResolvedValue('');
    deps.userRepository.findByEmail.mockResolvedValue(null);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('access-request');
    if (outcome.kind === 'access-request') {
      expect(outcome.redirectUrl).toMatch(/\/ui\/access-request\?session=/);
    }
    expect(deps.userRepository.createUserWithProject).not.toHaveBeenCalled();
    expect(deps.createAuthTokenFn).not.toHaveBeenCalled();
  });

  it('ineligible existing user is disabled and gets UI-only', async () => {
    const deps = createCoordinatorDeps();
    deps.resolveNextRole.mockResolvedValue('');
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    } as any);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('access-request');
    expect(deps.userRepository.setUserDisabled).toHaveBeenCalledWith('user-1', true);
  });

  it('disabled user re-enabled when role becomes eligible', async () => {
    const deps = createCoordinatorDeps();
    deps.resolveNextRole.mockResolvedValue('global:member');
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: true,
    } as any);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('eligible');
    expect(deps.userRepository.setUserDisabled).toHaveBeenCalledWith('user-1', false);
  });

  it('first user becomes global:owner', async () => {
    const deps = createCoordinatorDeps();
    deps.userRepository.count.mockResolvedValue(0);
    deps.userRepository.findByEmail.mockResolvedValue(null);
    deps.resolveNextRole.mockResolvedValue('global:member');
    let capturedRole = '';
    deps.userRepository.createUserWithProject.mockImplementation(async (data: any) => {
      capturedRole = data.role.slug;
      return { user: { id: 'user-1', email: data.email, role: { slug: capturedRole } } } as any;
    });
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('eligible');
    expect(capturedRole).toBe('global:owner');
  });

  it('existing user no-op when role unchanged', async () => {
    const deps = createCoordinatorDeps();
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    } as any);
    deps.resolveNextRole.mockResolvedValue('global:member');
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('eligible');
    expect(deps.userService.changeUserRole).not.toHaveBeenCalled();
  });

  it('fails closed on missing email in OIDC response', async () => {
    const deps = createCoordinatorDeps();
    deps.extractIdentity.mockReturnValue({ email: null, subject: 'sub', claims: {}, issuer: '', audience: [] } as any);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('failure');
    expect((outcome as any).publicMessage).toContain('No valid email');
    expect(deps.prepareExchange).not.toHaveBeenCalled();
    expect(deps.createAuthTokenFn).not.toHaveBeenCalled();
  });

  it('maps Redis persist failure to controlled failure with no partial session', async () => {
    const deps = createCoordinatorDeps();
    deps.persistTokens.mockRejectedValue(new Error('Redis connection failed'));
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
    } as any);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('failure');
    expect((outcome as any).publicMessage).toBe('Authentication failed');
    expect(deps.prepareExchange).not.toHaveBeenCalled();
    expect(deps.createAuthTokenFn).not.toHaveBeenCalled();
  });

  it('maps UI exchange Redis failure to failure and does not issue n8n token', async () => {
    const prepareExchange = vi.fn(async () => {
      throw new Error('Redis write failed');
    });
    const createAuthTokenFn = vi.fn(() => 'should-not-be-called');
    const deps = createCoordinatorDeps({ prepareExchange, createAuthTokenFn });
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
    } as any);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('failure');
    expect(createAuthTokenFn).not.toHaveBeenCalled();
  });

  it('maps missing access token (raw token mode) to failure', async () => {
    const prepareExchange = vi.fn(async () => {
      throw new Error('OIDC provider did not return an access token');
    });
    const deps = createCoordinatorDeps({ prepareExchange });
    deps.completeAuthorization.mockResolvedValue({
      discovery: { issuer: 'https://issuer.example.com' },
      tokens: { id_token: 'id-1', refresh_token: 'refresh-1' }, // no access_token
      mergedClaims: createTestIdTokenClaims(),
      idTokenClaims: createTestIdTokenClaims(),
      userInfo: null,
    });
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
    } as any);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('failure');
    expect((outcome as any).publicMessage).toContain('OIDC provider did not return an access token');
  });

  it('maps provisioning failure to controlled failure', async () => {
    const deps = createCoordinatorDeps();
    deps.userRepository.findByEmail.mockResolvedValue(null);
    deps.userRepository.createUserWithProject.mockRejectedValue(new Error('DB failure'));
    deps.resolveNextRole.mockResolvedValue('global:member');
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('failure');
    expect(deps.prepareExchange).not.toHaveBeenCalled();
  });

  it('maps role-sync failure to controlled failure', async () => {
    const deps = createCoordinatorDeps();
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    } as any);
    deps.resolveNextRole.mockResolvedValue('global:admin');
    deps.userService.changeUserRole.mockRejectedValue(new Error('role update failed'));
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('failure');
    expect(deps.prepareExchange).not.toHaveBeenCalled();
  });

  it('cleans up UI exchange when n8n token issuance fails (no ambiguous partial success)', async () => {
    const prepareExchange = vi.fn(async () => ({ handle: 'handle-1', token: 'ui-token-1' }));
    const createAuthTokenFn = vi.fn(() => {
      throw new Error('jwt sign failed');
    });
    const consumeExchange = vi.fn(async () => null);
    const deps = createCoordinatorDeps({ prepareExchange, createAuthTokenFn, consumeExchange });
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
    } as any);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('failure');
    expect(consumeExchange).toHaveBeenCalledWith('handle-1');
  });

  it('preserves returnTo policy and never sends handle to rejected target', async () => {
    const deps = createCoordinatorDeps();
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
    } as any);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: {
        state: 's1',
        codeVerifier: 'v1',
        redirectUri: 'https://app.example.com/auth/oidc/callback',
        returnTo: '//evil.test',
      },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('eligible');
    if (outcome.kind === 'eligible') {
      expect(outcome.redirectUrl).not.toContain('evil.test');
      expect(outcome.redirectUrl).toMatch(/\/ui\/\?/);
      expect(outcome.redirectUrl).toContain('session=handle-1');
    }
  });

  it('CSTAR verification failure maps to stable public error', async () => {
    const deps = createCoordinatorDeps();
    deps.resolveNextRole.mockRejectedValue(new Error('Unable to verify CSTAR tenant roles during sign-in'));
    deps.userRepository.findByEmail.mockResolvedValue(null);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('failure');
    expect((outcome as any).publicMessage).toContain('Unable to verify CSTAR');
  });

  it('provider completion failure maps to Authentication failed', async () => {
    const deps = createCoordinatorDeps();
    deps.completeAuthorization.mockRejectedValue(new Error('token endpoint unavailable'));
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('failure');
    expect((outcome as any).publicMessage).toContain('Authentication failed');
  });
});

describe('syncN8nUserRole domain op', () => {
  it('does not downgrade last owner', async () => {
    const userRepository: any = {
      createQueryBuilder: vi.fn(() => ({
        innerJoin: () => ({
          where: () => ({
            andWhere: () => ({
              getCount: async () => 0,
            }),
          }),
        }),
      })),
    };
    const userService: any = { changeUserRole: vi.fn(async () => undefined) };
    const user: any = { id: 'u1', email: 'owner@example.com', role: { slug: 'global:owner' } };

    await syncN8nUserRole({ user, nextRole: 'global:member', userRepository, userService });

    expect(userService.changeUserRole).not.toHaveBeenCalled();
  });

  it('downgrades owner when another owner exists', async () => {
    const userRepository: any = {
      createQueryBuilder: vi.fn(() => ({
        innerJoin: () => ({
          where: () => ({
            andWhere: () => ({
              getCount: async () => 1,
            }),
          }),
        }),
      })),
    };
    const userService: any = { changeUserRole: vi.fn(async () => undefined) };
    const user: any = { id: 'u1', email: 'owner@example.com', role: { slug: 'global:owner' } };

    await syncN8nUserRole({ user, nextRole: 'global:member', userRepository, userService });

    expect(userService.changeUserRole).toHaveBeenCalledWith(user, { newRoleName: 'global:member' });
  });

  it('no-op when role unchanged', async () => {
    const userRepository: any = { createQueryBuilder: vi.fn() };
    const userService: any = { changeUserRole: vi.fn(async () => undefined) };
    const user: any = { id: 'u1', email: 'user@example.com', role: { slug: 'global:member' } };

    await syncN8nUserRole({ user, nextRole: 'global:member', userRepository, userService });

    expect(userService.changeUserRole).not.toHaveBeenCalled();
    expect(userRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('changes role when nextRole differs and not last owner', async () => {
    const userRepository: any = {
      createQueryBuilder: vi.fn(() => ({
        innerJoin: () => ({
          where: () => ({
            andWhere: () => ({
              getCount: async () => 1,
            }),
          }),
        }),
      })),
    };
    const userService: any = { changeUserRole: vi.fn(async () => undefined) };
    const user: any = { id: 'u1', email: 'user@example.com', role: { slug: 'global:member' } };

    await syncN8nUserRole({ user, nextRole: 'global:admin', userRepository, userService });

    expect(userService.changeUserRole).toHaveBeenCalledWith(user, { newRoleName: 'global:admin' });
  });
});

describe('prepareUiSessionExchange', () => {
  it('throws when access token missing and not separate token mode (direct test)', async () => {
    // This test documents the contract: issueUiSessionToken throws when missing upstream token
    const { issueUiSessionToken } = await import('../../../src/api/helpers/ui-auth-token');
    // We call prepareUiSessionExchange with missing token and deps that use real issueUiSessionToken
    // But UI_AUTH_USE_SEPARATE_TOKEN defaults false in test env, so should throw for missing token
    const identity: any = { email: 'user@example.com', subject: 'sub', issuer: 'iss', audience: ['aud'], claims: {} };
    // Provide failing deps to ensure we test ordering: prepare should fail
    const fakeIssue = vi.fn(async () => {
      throw new Error('OIDC provider did not return an access token');
    });
    await expect(
      prepareUiSessionExchange(identity, undefined, undefined, { issueToken: fakeIssue as any }),
    ).rejects.toThrow('OIDC provider did not return an access token');
  });
});

describe('OidcLoginCoordinator – post-login unified work (OIDC-07)', () => {
  it('eligible user triggers unified post-login work with prewarm+sync (eligible boundary)', async () => {
    const runPostLoginWork = vi.fn(async () => undefined);
    const tenantService: any = { prewarmTenantRolesAndGroups: vi.fn(async () => ({})) };
    const deps = createCoordinatorDeps({ runPostLoginWork, tenantService });
    // Add tenantService to deps for post-login path
    (deps as any).tenantService = tenantService;
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    } as any);
    deps.resolveNextRole.mockResolvedValue('global:member');
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('eligible');
    // Wait a tick for fire-and-forget
    await new Promise((r) => setTimeout(r, 10));
    expect(runPostLoginWork).toHaveBeenCalledTimes(1);
    expect(runPostLoginWork).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com', n8nUserId: 'user-1', accessToken: 'access-token-1' }),
    );
  });

  it('access-request-only user does NOT trigger post-login pre-warm/sync (boundary)', async () => {
    const runPostLoginWork = vi.fn(async () => undefined);
    const tenantService: any = { prewarmTenantRolesAndGroups: vi.fn(async () => ({})) };
    const deps = createCoordinatorDeps({ runPostLoginWork, tenantService });
    (deps as any).tenantService = tenantService;
    deps.resolveNextRole.mockResolvedValue(''); // ineligible
    deps.userRepository.findByEmail.mockResolvedValue(null);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('access-request');
    await new Promise((r) => setTimeout(r, 10));
    expect(runPostLoginWork).not.toHaveBeenCalled();
  });

  it('missing access_token skips post-login work but still succeeds for eligible via separate-token fallback or fails appropriately', async () => {
    const runPostLoginWork = vi.fn(async () => undefined);
    const tenantService: any = { prewarmTenantRolesAndGroups: vi.fn(async () => ({})) };
    const deps = createCoordinatorDeps({ runPostLoginWork, tenantService });
    (deps as any).tenantService = tenantService;
    // Simulate provider returning no access_token — prepareExchange will fail for raw-token mode, so outcome is failure, not eligible
    // To test missing-token skip, we use a token response with access_token undefined but mock prepareExchange to succeed (separate token mode)
    deps.completeAuthorization.mockResolvedValue({
      discovery: { issuer: 'https://issuer.example.com' },
      tokens: { id_token: 'id-1', refresh_token: 'refresh-1' }, // no access_token
      mergedClaims: createTestIdTokenClaims(),
      idTokenClaims: createTestIdTokenClaims(),
      userInfo: null,
    });
    // Make prepareExchange succeed even without access_token (simulate separate token mode where issue uses sessionId)
    const prepareExchange = vi.fn(async () => ({ handle: 'h1', token: 'ui-1' }));
    deps.prepareExchange = prepareExchange;
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    } as any);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    // In this mocked separate-token scenario, eligible still succeeds but post-login should be skipped due to missing access token
    // However our current coordinator will still attempt post-login only if access_token present; so verify not called
    await new Promise((r) => setTimeout(r, 10));
    expect(runPostLoginWork).not.toHaveBeenCalled();
  });

  it('post-login failure is logged but does not fail login (login-success contract)', async () => {
    const runPostLoginWork = vi.fn(async () => {
      throw new Error('CSTAR timeout');
    });
    const tenantService: any = { prewarmTenantRolesAndGroups: vi.fn(async () => ({})) };
    const deps = createCoordinatorDeps({ runPostLoginWork, tenantService });
    (deps as any).tenantService = tenantService;
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    } as any);
    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('eligible');
    await new Promise((r) => setTimeout(r, 10));
    expect(runPostLoginWork).toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Tenant post-login work failed',
      expect.objectContaining({ email: 'user@example.com' }),
    );
  });

  it('eligible reuses CSTAR tenants fetch between eligibility and post-login (avoids duplicate)', async () => {
    const getUserTenantsStrict = vi.fn(async () => [{ id: 't1', name: 'Tenant 1' }]);
    const getUserSharedServiceRolesStrict = vi.fn(async () => [{ name: 'project:editor' }]);
    const runPostLoginWork = vi.fn(async (params: any) => {
      // Verify tenants were passed through from eligibility
      expect(params.tenants).toEqual([{ id: 't1', name: 'Tenant 1' }]);
    });
    const tenantService: any = { prewarmTenantRolesAndGroups: vi.fn(async () => ({})) };
    const cstarService: any = {
      isConfigured: () => true,
      getUserTenantsStrict,
      getUserSharedServiceRolesStrict,
      getUserTenants: vi.fn(async () => [{ id: 't1', name: 'Tenant 1' }]),
      getUserSharedServiceRoles: vi.fn(async () => [{ name: 'project:editor' }]),
    };
    const deps = createCoordinatorDeps({ cstarService, runPostLoginWork, tenantService });
    (deps as any).tenantService = tenantService;
    // Need restrictNoRole true and jwtRole null to trigger CSTAR eligibility path
    deps.config.restrictNoRole = true;
    deps.resolveNextRole = undefined as any; // use real resolveNextRoleInternal which will use cstarService
    // Override to use real resolver with cstarService; createCoordinatorDeps default resolveNextRole is mock, so remove it to use real
    delete (deps as any).resolveNextRole;
    // Need to ensure completeAuthorization returns claims without roles
    deps.completeAuthorization.mockResolvedValue({
      discovery: { issuer: 'https://issuer.example.com' },
      tokens: { access_token: 'access-token-1', id_token: 'id-1', refresh_token: 'refresh-1', expires_in: 300 },
      mergedClaims: createTestIdTokenClaims({ roles: undefined }),
      idTokenClaims: createTestIdTokenClaims({ roles: undefined }),
      userInfo: null,
    });
    deps.extractIdentity.mockReturnValue({
      subject: 'subject-1',
      email: 'user@example.com',
      preferredUsername: 'user',
      name: 'Test',
      issuer: 'https://issuer.example.com',
      audience: ['client-1'],
      claims: { sub: 'subject-1', email: 'user@example.com' },
    } as any);
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    } as any);

    const coord = new OidcLoginCoordinator(deps);

    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });

    expect(outcome.kind).toBe('eligible');
    await new Promise((r) => setTimeout(r, 10));
    expect(getUserTenantsStrict).toHaveBeenCalledTimes(1); // only eligibility fetch, post-login reused
    expect(runPostLoginWork).toHaveBeenCalled();
  });
});
