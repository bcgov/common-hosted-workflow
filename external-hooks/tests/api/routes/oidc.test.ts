import { describe, expect, it } from 'vitest';
import { buildOidcRouter, type BuildOidcRouterParams } from '../../../src/api/routes/oidc';

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
    authService: {
      invalidateToken: async () => undefined,
      clearCookie: () => undefined,
    },
    jwtService: {
      sign: () => 'token',
    },
    userService: {
      changeUserRole: async () => undefined,
    },
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

function getRoutePaths(router: { stack: Array<{ route?: { path?: string } }> }) {
  return router.stack
    .map((layer) => layer.route?.path)
    .filter((x): x is string => Boolean(x))
    .sort((left, right) => left.localeCompare(right));
}

describe('oidc router', () => {
  it('registers login, callback, and logout routes', () => {
    const router = buildOidcRouter(createMockParams());

    expect(getRoutePaths(router)).toEqual(['/callback', '/login', '/logout']);
  });
});
