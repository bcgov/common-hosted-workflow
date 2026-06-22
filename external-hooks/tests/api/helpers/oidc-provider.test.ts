import { describe, expect, it } from 'vitest';
import { buildOidcAuthorizationUrl } from '../../../src/api/helpers/oidc-provider';

describe('oidc-provider', () => {
  it('builds an authorization url with optional pkce', () => {
    const url = buildOidcAuthorizationUrl({
      discovery: { authorization_endpoint: 'https://issuer.example.com/auth' },
      config: {
        issuerUrl: 'https://issuer.example.com',
        authorizationEndpoint: 'https://issuer.example.com/auth',
        tokenEndpoint: 'https://issuer.example.com/token',
        userinfoEndpoint: 'https://issuer.example.com/userinfo',
        jwksUri: 'https://issuer.example.com/jwks',
        endSessionEndpoint: '',
        clientId: 'client-123',
        clientSecret: 'secret-123', // pragma: allowlist secret
        redirectUri: 'https://app.example.com/callback',
        scopes: 'openid email profile',
      },
      redirectUri: 'https://app.example.com/callback',
      state: 'state-123',
      nonce: 'nonce-123',
      codeChallenge: 'challenge-123',
    });

    expect(url).toContain('client_id=client-123');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback');
    expect(url).toContain('state=state-123');
    expect(url).toContain('nonce=nonce-123');
    expect(url).toContain('code_challenge=challenge-123');
  });
});
