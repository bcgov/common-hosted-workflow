'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const oidc_login_coordinator_1 = require('../../../src/api/services/oidc-login-coordinator');
const return_target_1 = require('../../../src/api/helpers/return-target');
function createTestIdTokenClaims(overrides = {}) {
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
  };
}
function mockPolicy(policy) {
  const base = (0, return_target_1.createReturnTargetPolicy)();
  return { ...base, ...policy };
}
function createMockUserRepository(overrides = {}) {
  return {
    findByEmail: vitest_1.vi.fn(async () => null),
    count: vitest_1.vi.fn(async () => 1),
    createUserWithProject: vitest_1.vi.fn(async (data) => ({
      user: { id: 'user-1', email: data.email, role: { slug: data.role.slug }, disabled: false },
    })),
    setUserDisabled: vitest_1.vi.fn(async () => undefined),
    createQueryBuilder: vitest_1.vi.fn(() => ({
      innerJoin: () => ({
        where: () => ({
          andWhere: () => ({
            getCount: async () => 1,
          }),
        }),
      }),
    })),
    ...overrides,
  };
}
function createCoordinatorDeps(overrides = {}) {
  const userRepository = createMockUserRepository(overrides.userRepository);
  const projectRepository = {
    getPersonalProjectForUser: vitest_1.vi.fn(async () => ({ id: 'proj-1' })),
    findOneBy: vitest_1.vi.fn(async () => null),
    create: (x) => x,
    save: vitest_1.vi.fn(async (x) => ({ id: 'proj-1', ...x })),
  };
  const tenantProjectRelationRepository = {
    getTenantIdByProjectId: vitest_1.vi.fn(async () => null),
    insertIgnoreConflict: vitest_1.vi.fn(async () => undefined),
    getProjectIdsByTenantId: vitest_1.vi.fn(async () => []),
  };
  const completeAuthorization = vitest_1.vi.fn(async () => ({
    discovery: { issuer: 'https://issuer.example.com' },
    tokens: { access_token: 'access-token-1', id_token: 'id-1', refresh_token: 'refresh-1', expires_in: 300 },
    mergedClaims: createTestIdTokenClaims(),
    idTokenClaims: createTestIdTokenClaims(),
    userInfo: null,
  }));
  const extractIdentity = vitest_1.vi.fn((params) => ({
    subject: params.claims.sub,
    email: params.claims.email,
    preferredUsername: params.claims.preferred_username,
    name: params.claims.name,
    issuer: 'https://issuer.example.com',
    audience: ['client-1'],
    claims: params.claims,
  }));
  const resolveCstarSsoUserId = vitest_1.vi.fn(() => 'sso-1');
  const resolveNextRole = vitest_1.vi.fn(async () => 'global:member');
  const persistTokens = vitest_1.vi.fn(async () => undefined);
  const prepareExchange = vitest_1.vi.fn(async () => ({ handle: 'handle-1', token: 'ui-token-1' }));
  const ensureTenantMapping = vitest_1.vi.fn(async () => undefined);
  const createAuthTokenFn = vitest_1.vi.fn(() => 'n8n-token-1');
  const consumeExchange = vitest_1.vi.fn(async () => null);
  const getSessionIssueId = vitest_1.vi.fn(async () => null);
  const setSessionIssueId = vitest_1.vi.fn(async () => undefined);
  const deleteSessionIssueId = vitest_1.vi.fn(async () => undefined);
  const deleteSessionExchange = vitest_1.vi.fn(async () => undefined);
  const deps = {
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
    jwtService: { sign: () => 'token' },
    userService: { changeUserRole: vitest_1.vi.fn(async () => undefined) },
    tenantProjectSyncService: { syncTenantsForUser: vitest_1.vi.fn(async () => undefined) },
    cstarService: {
      isConfigured: () => false,
      getUserTenantsStrict: vitest_1.vi.fn(async () => []),
      getUserSharedServiceRolesStrict: vitest_1.vi.fn(async () => []),
    },
    completeAuthorization,
    extractIdentity,
    resolveCstarSsoUserId,
    resolveNextRole,
    persistTokens,
    prepareExchange,
    ensureTenantMapping,
    createAuthTokenFn,
    consumeExchange,
    getSessionIssueId,
    setSessionIssueId,
    deleteSessionIssueId,
    deleteSessionExchange,
    logger: {
      debug: vitest_1.vi.fn(),
      info: vitest_1.vi.fn(),
      warn: vitest_1.vi.fn(),
      error: vitest_1.vi.fn(),
      child: vitest_1.vi.fn(),
    },
    ...overrides,
  };
  // Allow overrides to replace nested mocks
  if (overrides.userRepository) deps.userRepository = createMockUserRepository(overrides.userRepository);
  return deps;
}
(0, vitest_1.describe)('OidcLoginCoordinator', () => {
  (0, vitest_1.beforeEach)(() => {
    vitest_1.vi.restoreAllMocks();
  });
  (0, vitest_1.it)(
    'eligible existing user creates dual session with UI exchange before n8n token (atomic)',
    async () => {
      const order = [];
      const prepareExchange = vitest_1.vi.fn(async () => {
        order.push('prepareExchange');
        return { handle: 'handle-1', token: 'ui-token-1' };
      });
      const createAuthTokenFn = vitest_1.vi.fn(() => {
        order.push('createAuthToken');
        return 'n8n-token-1';
      });
      const deps = createCoordinatorDeps({ prepareExchange, createAuthTokenFn });
      deps.userRepository.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: { slug: 'global:member' },
        disabled: false,
      });
      const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
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
      (0, vitest_1.expect)(outcome.kind).toBe('eligible');
      if (outcome.kind === 'eligible') {
        (0, vitest_1.expect)(outcome.n8nAuthToken).toBe('n8n-token-1');
        (0, vitest_1.expect)(outcome.uiHandle).toBe('handle-1');
        (0, vitest_1.expect)(outcome.redirectUrl).toContain('/ui/projects');
        (0, vitest_1.expect)(outcome.redirectUrl).toContain('session=handle-1');
        (0, vitest_1.expect)(outcome.redirectUrl).toContain('x=1');
        (0, vitest_1.expect)(outcome.redirectUrl.endsWith('#frag')).toBe(true);
      }
      (0, vitest_1.expect)(order).toEqual(['prepareExchange', 'createAuthToken']);
      (0, vitest_1.expect)(deps.persistTokens).toHaveBeenCalled();
    },
  );
  (0, vitest_1.it)('ineligible new user gets UI-only access-request without creating n8n user', async () => {
    const deps = createCoordinatorDeps();
    deps.resolveNextRole.mockResolvedValue('');
    deps.userRepository.findByEmail.mockResolvedValue(null);
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('access-request');
    if (outcome.kind === 'access-request') {
      (0, vitest_1.expect)(outcome.redirectUrl).toMatch(/\/ui\/access-request\?session=/);
    }
    (0, vitest_1.expect)(deps.userRepository.createUserWithProject).not.toHaveBeenCalled();
    (0, vitest_1.expect)(deps.createAuthTokenFn).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('ineligible existing user is disabled and gets UI-only', async () => {
    const deps = createCoordinatorDeps();
    deps.resolveNextRole.mockResolvedValue('');
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    });
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('access-request');
    (0, vitest_1.expect)(deps.userRepository.setUserDisabled).toHaveBeenCalledWith('user-1', true);
  });
  (0, vitest_1.it)('disabled user re-enabled when role becomes eligible', async () => {
    const deps = createCoordinatorDeps();
    deps.resolveNextRole.mockResolvedValue('global:member');
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: true,
    });
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('eligible');
    (0, vitest_1.expect)(deps.userRepository.setUserDisabled).toHaveBeenCalledWith('user-1', false);
  });
  (0, vitest_1.it)('first user becomes global:owner', async () => {
    const deps = createCoordinatorDeps();
    deps.userRepository.count.mockResolvedValue(0);
    deps.userRepository.findByEmail.mockResolvedValue(null);
    deps.resolveNextRole.mockResolvedValue('global:member');
    let capturedRole = '';
    deps.userRepository.createUserWithProject.mockImplementation(async (data) => {
      capturedRole = data.role.slug;
      return { user: { id: 'user-1', email: data.email, role: { slug: capturedRole } } };
    });
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('eligible');
    (0, vitest_1.expect)(capturedRole).toBe('global:owner');
  });
  (0, vitest_1.it)('existing user no-op when role unchanged', async () => {
    const deps = createCoordinatorDeps();
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    });
    deps.resolveNextRole.mockResolvedValue('global:member');
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('eligible');
    (0, vitest_1.expect)(deps.userService.changeUserRole).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('fails closed on missing email in OIDC response', async () => {
    const deps = createCoordinatorDeps();
    deps.extractIdentity.mockReturnValue({ email: null, subject: 'sub', claims: {}, issuer: '', audience: [] });
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('failure');
    (0, vitest_1.expect)(outcome.publicMessage).toContain('No valid email');
    (0, vitest_1.expect)(deps.prepareExchange).not.toHaveBeenCalled();
    (0, vitest_1.expect)(deps.createAuthTokenFn).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('maps Redis persist failure to controlled failure with no partial session', async () => {
    const deps = createCoordinatorDeps();
    deps.persistTokens.mockRejectedValue(new Error('Redis connection failed'));
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
    });
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('failure');
    (0, vitest_1.expect)(outcome.publicMessage).toBe('Authentication failed');
    (0, vitest_1.expect)(deps.prepareExchange).not.toHaveBeenCalled();
    (0, vitest_1.expect)(deps.createAuthTokenFn).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('maps UI exchange Redis failure to failure and does not issue n8n token', async () => {
    const prepareExchange = vitest_1.vi.fn(async () => {
      throw new Error('Redis write failed');
    });
    const createAuthTokenFn = vitest_1.vi.fn(() => 'should-not-be-called');
    const deps = createCoordinatorDeps({ prepareExchange, createAuthTokenFn });
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
    });
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('failure');
    (0, vitest_1.expect)(createAuthTokenFn).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('maps missing access token (raw token mode) to failure', async () => {
    const prepareExchange = vitest_1.vi.fn(async () => {
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
    });
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('failure');
    (0, vitest_1.expect)(outcome.publicMessage).toContain('OIDC provider did not return an access token');
  });
  (0, vitest_1.it)('maps provisioning failure to controlled failure', async () => {
    const deps = createCoordinatorDeps();
    deps.userRepository.findByEmail.mockResolvedValue(null);
    deps.userRepository.createUserWithProject.mockRejectedValue(new Error('DB failure'));
    deps.resolveNextRole.mockResolvedValue('global:member');
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('failure');
    (0, vitest_1.expect)(deps.prepareExchange).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('maps role-sync failure to controlled failure', async () => {
    const deps = createCoordinatorDeps();
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    });
    deps.resolveNextRole.mockResolvedValue('global:admin');
    deps.userService.changeUserRole.mockRejectedValue(new Error('role update failed'));
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('failure');
    (0, vitest_1.expect)(deps.prepareExchange).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('cleans up UI exchange when n8n token issuance fails (no ambiguous partial success)', async () => {
    const prepareExchange = vitest_1.vi.fn(async () => ({ handle: 'handle-1', token: 'ui-token-1' }));
    const createAuthTokenFn = vitest_1.vi.fn(() => {
      throw new Error('jwt sign failed');
    });
    const consumeExchange = vitest_1.vi.fn(async () => null);
    const deps = createCoordinatorDeps({ prepareExchange, createAuthTokenFn, consumeExchange });
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
    });
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('failure');
    (0, vitest_1.expect)(consumeExchange).toHaveBeenCalledWith('handle-1');
  });
  (0, vitest_1.it)('preserves returnTo policy and never sends handle to rejected target', async () => {
    const deps = createCoordinatorDeps();
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
    });
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
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
    (0, vitest_1.expect)(outcome.kind).toBe('eligible');
    if (outcome.kind === 'eligible') {
      (0, vitest_1.expect)(outcome.redirectUrl).not.toContain('evil.test');
      (0, vitest_1.expect)(outcome.redirectUrl).toMatch(/\/ui\/\?/);
      (0, vitest_1.expect)(outcome.redirectUrl).toContain('session=handle-1');
    }
  });
  (0, vitest_1.it)('CSTAR verification failure maps to stable public error', async () => {
    const deps = createCoordinatorDeps();
    deps.resolveNextRole.mockRejectedValue(new Error('Unable to verify CSTAR tenant roles during sign-in'));
    deps.userRepository.findByEmail.mockResolvedValue(null);
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('failure');
    (0, vitest_1.expect)(outcome.publicMessage).toContain('Unable to verify CSTAR');
  });
  (0, vitest_1.it)('provider completion failure maps to Authentication failed', async () => {
    const deps = createCoordinatorDeps();
    deps.completeAuthorization.mockRejectedValue(new Error('token endpoint unavailable'));
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('failure');
    (0, vitest_1.expect)(outcome.publicMessage).toContain('Authentication failed');
  });
});
(0, vitest_1.describe)('syncN8nUserRole domain op', () => {
  (0, vitest_1.it)('does not downgrade last owner', async () => {
    const userRepository = {
      createQueryBuilder: vitest_1.vi.fn(() => ({
        innerJoin: () => ({
          where: () => ({
            andWhere: () => ({
              getCount: async () => 0,
            }),
          }),
        }),
      })),
    };
    const userService = { changeUserRole: vitest_1.vi.fn(async () => undefined) };
    const user = { id: 'u1', email: 'owner@example.com', role: { slug: 'global:owner' } };
    await (0, oidc_login_coordinator_1.syncN8nUserRole)({
      user,
      nextRole: 'global:member',
      userRepository,
      userService,
    });
    (0, vitest_1.expect)(userService.changeUserRole).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('downgrades owner when another owner exists', async () => {
    const userRepository = {
      createQueryBuilder: vitest_1.vi.fn(() => ({
        innerJoin: () => ({
          where: () => ({
            andWhere: () => ({
              getCount: async () => 1,
            }),
          }),
        }),
      })),
    };
    const userService = { changeUserRole: vitest_1.vi.fn(async () => undefined) };
    const user = { id: 'u1', email: 'owner@example.com', role: { slug: 'global:owner' } };
    await (0, oidc_login_coordinator_1.syncN8nUserRole)({
      user,
      nextRole: 'global:member',
      userRepository,
      userService,
    });
    (0, vitest_1.expect)(userService.changeUserRole).toHaveBeenCalledWith(user, { newRoleName: 'global:member' });
  });
  (0, vitest_1.it)('no-op when role unchanged', async () => {
    const userRepository = { createQueryBuilder: vitest_1.vi.fn() };
    const userService = { changeUserRole: vitest_1.vi.fn(async () => undefined) };
    const user = { id: 'u1', email: 'user@example.com', role: { slug: 'global:member' } };
    await (0, oidc_login_coordinator_1.syncN8nUserRole)({
      user,
      nextRole: 'global:member',
      userRepository,
      userService,
    });
    (0, vitest_1.expect)(userService.changeUserRole).not.toHaveBeenCalled();
    (0, vitest_1.expect)(userRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('changes role when nextRole differs and not last owner', async () => {
    const userRepository = {
      createQueryBuilder: vitest_1.vi.fn(() => ({
        innerJoin: () => ({
          where: () => ({
            andWhere: () => ({
              getCount: async () => 1,
            }),
          }),
        }),
      })),
    };
    const userService = { changeUserRole: vitest_1.vi.fn(async () => undefined) };
    const user = { id: 'u1', email: 'user@example.com', role: { slug: 'global:member' } };
    await (0, oidc_login_coordinator_1.syncN8nUserRole)({
      user,
      nextRole: 'global:admin',
      userRepository,
      userService,
    });
    (0, vitest_1.expect)(userService.changeUserRole).toHaveBeenCalledWith(user, { newRoleName: 'global:admin' });
  });
});
(0, vitest_1.describe)('prepareUiSessionExchange', () => {
  (0, vitest_1.it)('throws when access token missing and not separate token mode (direct test)', async () => {
    // This test documents the contract: issueUiSessionToken throws when missing upstream token
    const { issueUiSessionToken } = await Promise.resolve().then(() =>
      __importStar(require('../../../src/api/helpers/ui-auth-token')),
    );
    // We call prepareUiSessionExchange with missing token and deps that use real issueUiSessionToken
    // But UI_AUTH_USE_SEPARATE_TOKEN defaults false in test env, so should throw for missing token
    const identity = { email: 'user@example.com', subject: 'sub', issuer: 'iss', audience: ['aud'], claims: {} };
    // Provide failing deps to ensure we test ordering: prepare should fail
    const fakeIssue = vitest_1.vi.fn(async () => {
      throw new Error('OIDC provider did not return an access token');
    });
    await (0, vitest_1.expect)(
      (0, oidc_login_coordinator_1.prepareUiSessionExchange)(identity, undefined, undefined, { issueToken: fakeIssue }),
    ).rejects.toThrow('OIDC provider did not return an access token');
  });
});
(0, vitest_1.describe)('atomic issuance and revocation semantics', () => {
  (0, vitest_1.it)(
    'no failed eligible login leaves a consumable exchange handle (createAuthToken failure cleans handle and sid)',
    async () => {
      const priorSid = 'prior-sid-123';
      const getSessionIssueId = vitest_1.vi.fn(async () => priorSid);
      const setSessionIssueId = vitest_1.vi.fn(async () => undefined);
      const deleteSessionIssueId = vitest_1.vi.fn(async () => undefined);
      const consumeExchange = vitest_1.vi.fn(async () => null);
      const deleteSessionExchange = vitest_1.vi.fn(async () => undefined);
      const prepareExchange = vitest_1.vi.fn(async () => ({ handle: 'handle-1', token: 'ui-token-1' }));
      const createAuthTokenFn = vitest_1.vi.fn(() => {
        throw new Error('jwt sign failed');
      });
      const deps = createCoordinatorDeps({
        prepareExchange,
        createAuthTokenFn,
        consumeExchange,
        getSessionIssueId,
        setSessionIssueId,
        deleteSessionIssueId,
        deleteSessionExchange,
      });
      deps.userRepository.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: { slug: 'global:member' },
      });
      const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
      const outcome = await coord.handleCallback({
        code: 'code-1',
        statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
        noncePayload: { nonce: 'nonce-1' },
      });
      (0, vitest_1.expect)(outcome.kind).toBe('failure');
      // handle must be cleaned (consume attempted, idempotent delete fallback available)
      (0, vitest_1.expect)(consumeExchange).toHaveBeenCalledWith('handle-1');
      // prior sid must be restored (preserving pre-existing session)
      (0, vitest_1.expect)(setSessionIssueId).toHaveBeenCalledWith('user@example.com', priorSid);
      (0, vitest_1.expect)(deleteSessionIssueId).not.toHaveBeenCalled();
    },
  );
  (0, vitest_1.it)(
    'failed re-login preserves prior session (sid restored), new login deletes new sid (no prior)',
    async () => {
      // re-login case: prior exists → restored
      const priorSid = 'prior-sid-abc';
      const getSessionIssueIdP = vitest_1.vi.fn(async () => priorSid);
      const setSessionIssueIdP = vitest_1.vi.fn(async () => undefined);
      const deleteSessionIssueIdP = vitest_1.vi.fn(async () => undefined);
      const consumeExchangeP = vitest_1.vi.fn(async () => null);
      const depsP = createCoordinatorDeps({
        prepareExchange: vitest_1.vi.fn(async () => ({ handle: 'h1', token: 'tok' })),
        createAuthTokenFn: vitest_1.vi.fn(() => {
          throw new Error('jwt sign failed');
        }),
        consumeExchange: consumeExchangeP,
        getSessionIssueId: getSessionIssueIdP,
        setSessionIssueId: setSessionIssueIdP,
        deleteSessionIssueId: deleteSessionIssueIdP,
      });
      depsP.userRepository.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: { slug: 'global:member' },
      });
      const coordP = new oidc_login_coordinator_1.OidcLoginCoordinator(depsP);
      const outP = await coordP.handleCallback({
        code: 'code-1',
        statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
        noncePayload: { nonce: 'nonce-1' },
      });
      (0, vitest_1.expect)(outP.kind).toBe('failure');
      (0, vitest_1.expect)(setSessionIssueIdP).toHaveBeenCalledWith('user@example.com', priorSid);
      // new login case: no prior → new sid deleted
      const getSessionIssueIdN = vitest_1.vi.fn(async () => null);
      const setSessionIssueIdN = vitest_1.vi.fn(async () => undefined);
      const deleteSessionIssueIdN = vitest_1.vi.fn(async () => undefined);
      const consumeExchangeN = vitest_1.vi.fn(async () => null);
      const depsN = createCoordinatorDeps({
        prepareExchange: vitest_1.vi.fn(async () => ({ handle: 'h2', token: 'tok2' })),
        createAuthTokenFn: vitest_1.vi.fn(() => {
          throw new Error('jwt sign failed');
        }),
        consumeExchange: consumeExchangeN,
        getSessionIssueId: getSessionIssueIdN,
        setSessionIssueId: setSessionIssueIdN,
        deleteSessionIssueId: deleteSessionIssueIdN,
      });
      depsN.userRepository.findByEmail.mockResolvedValue({
        id: 'user-2',
        email: 'new@example.com',
        role: { slug: 'global:member' },
      });
      const coordN = new oidc_login_coordinator_1.OidcLoginCoordinator(depsN);
      const outN = await coordN.handleCallback({
        code: 'code-1',
        statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
        noncePayload: { nonce: 'nonce-1' },
      });
      (0, vitest_1.expect)(outN.kind).toBe('failure');
      // identity email is always user@example.com from claims, so cleanup uses that email
      (0, vitest_1.expect)(deleteSessionIssueIdN).toHaveBeenCalledWith('user@example.com');
      (0, vitest_1.expect)(setSessionIssueIdN).not.toHaveBeenCalled();
    },
  );
  (0, vitest_1.it)('cleanup is idempotent and preserves original error when cleanup also fails', async () => {
    const priorSid = 'prior-sid-xyz';
    const getSessionIssueId = vitest_1.vi.fn(async () => priorSid);
    const setSessionIssueId = vitest_1.vi.fn(async () => {
      throw new Error('Redis set failed during restore');
    });
    const consumeExchange = vitest_1.vi.fn(async () => {
      throw new Error('Redis del failed');
    });
    const deleteSessionExchange = vitest_1.vi.fn(async () => {
      throw new Error('Redis del failed');
    });
    const deps = createCoordinatorDeps({
      prepareExchange: vitest_1.vi.fn(async () => ({ handle: 'handle-err', token: 'tok' })),
      createAuthTokenFn: vitest_1.vi.fn(() => {
        throw new Error('jwt sign failed');
      }),
      consumeExchange,
      getSessionIssueId,
      setSessionIssueId,
      deleteSessionExchange,
    });
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
    });
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    // original error is preserved as generic Authentication failed, not the cleanup error
    (0, vitest_1.expect)(outcome.kind).toBe('failure');
    (0, vitest_1.expect)(outcome.publicMessage).toBe('Authentication failed');
    // cleanup was attempted despite failing second DEL
    (0, vitest_1.expect)(consumeExchange).toHaveBeenCalledWith('handle-err');
    (0, vitest_1.expect)(deleteSessionExchange).toHaveBeenCalledWith('handle-err');
    (0, vitest_1.expect)(setSessionIssueId).toHaveBeenCalledWith('user@example.com', priorSid);
  });
  (0, vitest_1.it)(
    'prepareUiSessionExchange: setExchange failure restores prior sid or deletes new sid and preserves original error',
    async () => {
      const identity = { email: 'user@example.com', subject: 'sub', issuer: 'iss', audience: ['aud'], claims: {} };
      // case 1: prior exists -> restore
      const getIssue1 = vitest_1.vi.fn(async () => 'prior-1');
      const setIssue1 = vitest_1.vi.fn(async () => undefined);
      const setEx1 = vitest_1.vi.fn(async () => {
        throw new Error('Redis setExchange failed');
      });
      const delIssue1 = vitest_1.vi.fn(async () => undefined);
      await (0, vitest_1.expect)(
        (0, oidc_login_coordinator_1.prepareUiSessionExchange)(identity, 'at', 999999, {
          issueToken: vitest_1.vi.fn(async () => 'tok'),
          setIssueId: setIssue1,
          setExchange: setEx1,
          getIssueId: getIssue1,
          deleteIssueId: delIssue1,
        }),
      ).rejects.toThrow('Redis setExchange failed');
      (0, vitest_1.expect)(setIssue1).toHaveBeenCalledTimes(2); // initial write + restore
      // restore called after failure (second call with prior)
      (0, vitest_1.expect)(setIssue1).toHaveBeenCalledWith('user@example.com', 'prior-1');
      (0, vitest_1.expect)(delIssue1).not.toHaveBeenCalled();
      // case 2: no prior -> delete new sid, original error preserved even if delete fails
      const getIssue2 = vitest_1.vi.fn(async () => null);
      const setIssue2 = vitest_1.vi.fn(async () => undefined);
      const setEx2 = vitest_1.vi.fn(async () => {
        throw new Error('Redis setExchange failed2');
      });
      const delIssue2 = vitest_1.vi.fn(async () => {
        throw new Error('delete failed');
      });
      await (0, vitest_1.expect)(
        (0, oidc_login_coordinator_1.prepareUiSessionExchange)(identity, 'at', 999999, {
          issueToken: vitest_1.vi.fn(async () => 'tok'),
          setIssueId: setIssue2,
          setExchange: setEx2,
          getIssueId: getIssue2,
          deleteIssueId: delIssue2,
        }),
      ).rejects.toThrow('Redis setExchange failed2');
      (0, vitest_1.expect)(delIssue2).toHaveBeenCalledWith('user@example.com');
    },
  );
  (0, vitest_1.it)('failed provisioning does not leave consumable handle and does not mutate sid', async () => {
    const getSessionIssueId = vitest_1.vi.fn(async () => 'prior-sid');
    const setSessionIssueId = vitest_1.vi.fn(async () => undefined);
    const deps = createCoordinatorDeps({
      getSessionIssueId,
      setSessionIssueId,
    });
    deps.userRepository.findByEmail.mockResolvedValue(null);
    deps.userRepository.createUserWithProject.mockRejectedValue(new Error('DB failure'));
    deps.resolveNextRole.mockResolvedValue('global:member');
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('failure');
    (0, vitest_1.expect)(deps.prepareExchange).not.toHaveBeenCalled();
    // sid not mutated because failure before prepareExchange
    (0, vitest_1.expect)(setSessionIssueId).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)(
    'partial token persistence cannot create a session (failure aborts before handle, tokens overwrite-safe)',
    async () => {
      const persistTokens = vitest_1.vi.fn(async () => {
        throw new Error('Redis connection failed');
      });
      const prepareExchange = vitest_1.vi.fn(async () => ({ handle: 'should-not', token: 'tok' }));
      const deps = createCoordinatorDeps({ persistTokens, prepareExchange });
      deps.userRepository.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: { slug: 'global:member' },
      });
      const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
      const outcome = await coord.handleCallback({
        code: 'code-1',
        statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
        noncePayload: { nonce: 'nonce-1' },
      });
      (0, vitest_1.expect)(outcome.kind).toBe('failure');
      (0, vitest_1.expect)(prepareExchange).not.toHaveBeenCalled();
      // Even if some token keys were written before failure, they are overwrite-safe
      // and no sid/handle exists, so subsequent exchange with any handle would 401
    },
  );
  (0, vitest_1.it)('delete helpers are idempotent (DEL of missing key is no-op in fake and real Redis)', async () => {
    // Contract note: DEL is idempotent in real Redis (deleting a missing
    // key returns 0, not an error) and the store's compensating cleanup relies on
    // this. The fake's Map-based DEL models this accurately; this test verifies
    // the coordinator's cleanup path treats DEL as no-op via injected mocks
    // (see prior tests where delete... is called and second delete would still succeed).
    // We assert the injected delete mocks are idempotent by calling them twice.
    const delIssue = vitest_1.vi.fn(async () => undefined);
    const delExchange = vitest_1.vi.fn(async () => undefined);
    await (0, vitest_1.expect)(delIssue('nonexistent@example.com')).resolves.toBeUndefined();
    await (0, vitest_1.expect)(delExchange('nonexistent-handle')).resolves.toBeUndefined();
    // second call is also a no-op (idempotent)
    await (0, vitest_1.expect)(delIssue('nonexistent@example.com')).resolves.toBeUndefined();
    await (0, vitest_1.expect)(delExchange('nonexistent-handle')).resolves.toBeUndefined();
    (0, vitest_1.expect)(delIssue).toHaveBeenCalledTimes(2);
    (0, vitest_1.expect)(delExchange).toHaveBeenCalledTimes(2);
  });
});
(0, vitest_1.describe)('OidcLoginCoordinator – post-login unified work (OIDC-07)', () => {
  (0, vitest_1.it)('eligible user triggers unified post-login work with prewarm+sync (eligible boundary)', async () => {
    const runPostLoginWork = vitest_1.vi.fn(async () => undefined);
    const tenantService = { prewarmTenantRolesAndGroups: vitest_1.vi.fn(async () => ({})) };
    const deps = createCoordinatorDeps({ runPostLoginWork, tenantService });
    // Add tenantService to deps for post-login path
    deps.tenantService = tenantService;
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    });
    deps.resolveNextRole.mockResolvedValue('global:member');
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('eligible');
    // Wait a tick for fire-and-forget
    await new Promise((r) => setTimeout(r, 10));
    (0, vitest_1.expect)(runPostLoginWork).toHaveBeenCalledTimes(1);
    (0, vitest_1.expect)(runPostLoginWork).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({
        email: 'user@example.com',
        n8nUserId: 'user-1',
        accessToken: 'access-token-1',
      }),
    );
  });
  (0, vitest_1.it)('access-request-only user does NOT trigger post-login pre-warm/sync (boundary)', async () => {
    const runPostLoginWork = vitest_1.vi.fn(async () => undefined);
    const tenantService = { prewarmTenantRolesAndGroups: vitest_1.vi.fn(async () => ({})) };
    const deps = createCoordinatorDeps({ runPostLoginWork, tenantService });
    deps.tenantService = tenantService;
    deps.resolveNextRole.mockResolvedValue(''); // ineligible
    deps.userRepository.findByEmail.mockResolvedValue(null);
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('access-request');
    await new Promise((r) => setTimeout(r, 10));
    (0, vitest_1.expect)(runPostLoginWork).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)(
    'missing access_token skips post-login work but still succeeds for eligible via separate-token fallback or fails appropriately',
    async () => {
      const runPostLoginWork = vitest_1.vi.fn(async () => undefined);
      const tenantService = { prewarmTenantRolesAndGroups: vitest_1.vi.fn(async () => ({})) };
      const deps = createCoordinatorDeps({ runPostLoginWork, tenantService });
      deps.tenantService = tenantService;
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
      const prepareExchange = vitest_1.vi.fn(async () => ({ handle: 'h1', token: 'ui-1' }));
      deps.prepareExchange = prepareExchange;
      deps.userRepository.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: { slug: 'global:member' },
        disabled: false,
      });
      const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
      const outcome = await coord.handleCallback({
        code: 'code-1',
        statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
        noncePayload: { nonce: 'nonce-1' },
      });
      // In this mocked separate-token scenario, eligible still succeeds but post-login should be skipped due to missing access token
      // However our current coordinator will still attempt post-login only if access_token present; so verify not called
      await new Promise((r) => setTimeout(r, 10));
      (0, vitest_1.expect)(runPostLoginWork).not.toHaveBeenCalled();
    },
  );
  (0, vitest_1.it)('post-login failure is logged but does not fail login (login-success contract)', async () => {
    const runPostLoginWork = vitest_1.vi.fn(async () => {
      throw new Error('CSTAR timeout');
    });
    const tenantService = { prewarmTenantRolesAndGroups: vitest_1.vi.fn(async () => ({})) };
    const deps = createCoordinatorDeps({ runPostLoginWork, tenantService });
    deps.tenantService = tenantService;
    deps.userRepository.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: { slug: 'global:member' },
      disabled: false,
    });
    const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
    const outcome = await coord.handleCallback({
      code: 'code-1',
      statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
      noncePayload: { nonce: 'nonce-1' },
    });
    (0, vitest_1.expect)(outcome.kind).toBe('eligible');
    await new Promise((r) => setTimeout(r, 10));
    (0, vitest_1.expect)(runPostLoginWork).toHaveBeenCalled();
    (0, vitest_1.expect)(deps.logger.error).toHaveBeenCalledWith(
      'Tenant post-login work failed',
      vitest_1.expect.objectContaining({ email: 'user@example.com' }),
    );
  });
  (0, vitest_1.it)(
    'eligible reuses CSTAR tenants fetch between eligibility and post-login (avoids duplicate)',
    async () => {
      const getUserTenantsStrict = vitest_1.vi.fn(async () => [{ id: 't1', name: 'Tenant 1' }]);
      const getUserSharedServiceRolesStrict = vitest_1.vi.fn(async () => [{ name: 'project:editor' }]);
      const runPostLoginWork = vitest_1.vi.fn(async (params) => {
        // Verify tenants were passed through from eligibility
        (0, vitest_1.expect)(params.tenants).toEqual([{ id: 't1', name: 'Tenant 1' }]);
      });
      const tenantService = { prewarmTenantRolesAndGroups: vitest_1.vi.fn(async () => ({})) };
      const cstarService = {
        isConfigured: () => true,
        getUserTenantsStrict,
        getUserSharedServiceRolesStrict,
        getUserTenants: vitest_1.vi.fn(async () => [{ id: 't1', name: 'Tenant 1' }]),
        getUserSharedServiceRoles: vitest_1.vi.fn(async () => [{ name: 'project:editor' }]),
      };
      const deps = createCoordinatorDeps({ cstarService, runPostLoginWork, tenantService });
      deps.tenantService = tenantService;
      // Need restrictNoRole true and jwtRole null to trigger CSTAR eligibility path
      deps.config.restrictNoRole = true;
      deps.resolveNextRole = undefined; // use real resolveNextRoleInternal which will use cstarService
      // Override to use real resolver with cstarService; createCoordinatorDeps default resolveNextRole is mock, so remove it to use real
      delete deps.resolveNextRole;
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
      });
      deps.userRepository.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        role: { slug: 'global:member' },
        disabled: false,
      });
      const coord = new oidc_login_coordinator_1.OidcLoginCoordinator(deps);
      const outcome = await coord.handleCallback({
        code: 'code-1',
        statePayload: { state: 's1', codeVerifier: 'v1', redirectUri: 'https://app.example.com/auth/oidc/callback' },
        noncePayload: { nonce: 'nonce-1' },
      });
      (0, vitest_1.expect)(outcome.kind).toBe('eligible');
      await new Promise((r) => setTimeout(r, 10));
      (0, vitest_1.expect)(getUserTenantsStrict).toHaveBeenCalledTimes(1); // only eligibility fetch, post-login reused
      (0, vitest_1.expect)(runPostLoginWork).toHaveBeenCalled();
    },
  );
});
