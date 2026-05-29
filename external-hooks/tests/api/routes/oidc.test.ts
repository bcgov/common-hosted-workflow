import { describe, expect, it } from 'vitest';
import { buildOidcRouter, type BuildOidcRouterParams } from '../../../src/api/routes/oidc';

function getRoutePaths(router: { stack: Array<{ route?: { path?: string } }> }) {
  return router.stack
    .map((layer) => layer.route?.path)
    .filter(Boolean)
    .sort();
}

describe('oidc router', () => {
  it('registers login and callback routes', () => {
    const params: BuildOidcRouterParams = {
      dbCollections: {
        User: {
          findOne: async () => null,
          count: async () => 0,
          createQueryBuilder: () => ({
            innerJoin: () => ({
              where: () => ({
                andWhere: () => ({
                  getCount: async () => 0,
                }),
              }),
            }),
          }),
          createUserWithProject: async (userData) => ({
            user: { id: 'user-1', email: userData.email, role: { slug: 'global:owner' } },
          }),
        },
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
        clientId: 'client-1',
        clientSecret: 'secret-1', // pragma: allowlist secret
        redirectUri: 'https://app.example.com/auth/oidc/callback',
        scopes: 'openid email profile',
        rolesClaim: 'roles',
        restrictNoRole: false,
      },
    };

    const router = buildOidcRouter(params);

    expect(getRoutePaths(router)).toEqual(['/callback', '/login']);
  });
});
