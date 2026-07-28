import { describe, expect, it } from 'vitest';
import { buildOidcRouter, resolveNextRole, type BuildOidcRouterParams } from '../../../src/api/routes/oidc';

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
