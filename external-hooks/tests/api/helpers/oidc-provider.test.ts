import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
  buildOidcAuthorizationUrl,
  clearOidcDiscoveryCache,
  completeOidcAuthorization,
} from '../../../src/api/helpers/oidc-provider';
import type { OidcProviderConfig } from '../../../src/api/helpers/oidc-provider';

const ISSUER = 'https://issuer.example.com';
const JWKS_URI = 'https://issuer.example.com/jwks';
const TOKEN_ENDPOINT = 'https://issuer.example.com/token';
const USERINFO_ENDPOINT = 'https://issuer.example.com/userinfo';
const CLIENT_ID = 'client-123';
const NONCE = 'nonce-1';

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return (input as Request).url;
  return String(input);
}

function createBaseConfig(overrides: Partial<OidcProviderConfig> = {}): OidcProviderConfig {
  return {
    issuerUrl: ISSUER,
    authorizationEndpoint: `${ISSUER}/auth`,
    tokenEndpoint: TOKEN_ENDPOINT,
    userinfoEndpoint: USERINFO_ENDPOINT,
    jwksUri: JWKS_URI,
    endSessionEndpoint: '',
    clientId: CLIENT_ID,
    clientSecret: 'secret-123', // pragma: allowlist secret
    redirectUri: 'https://app.example.com/callback',
    scopes: 'openid email profile',
    ...overrides,
  };
}

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

  describe('completeOidcAuthorization verification', () => {
    let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
    let publicJwk: Record<string, unknown>;
    const originalFetch = globalThis.fetch;

    beforeEach(async () => {
      clearOidcDiscoveryCache();
      keyPair = await generateKeyPair('RS256');
      const jwk = await exportJWK(keyPair.publicKey);
      publicJwk = { ...jwk, kid: 'test-kid', alg: 'RS256', use: 'sig' };
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
      clearOidcDiscoveryCache();
    });

    async function signIdToken(
      claims: Record<string, unknown>,
      opts: { issuer?: string; audience?: string | string[]; expiresIn?: string; nonce?: string } = {},
    ) {
      const jwt = new SignJWT({ ...claims, nonce: opts.nonce ?? NONCE })
        .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid as string })
        .setIssuer(opts.issuer ?? ISSUER)
        .setAudience(opts.audience ?? CLIENT_ID)
        .setIssuedAt()
        .setExpirationTime(opts.expiresIn ?? '1h')
        .setSubject((claims.sub as string) ?? 'subject-1');
      return await jwt.sign(keyPair.privateKey);
    }

    async function setupMocks(
      opts: {
        idTokenClaims?: Record<string, unknown>;
        idTokenOpts?: {
          issuer?: string;
          audience?: string | string[];
          expiresIn?: string;
          nonce?: string;
          tamper?: boolean;
        };
        discoveryOverrides?: Record<string, unknown>;
        configOverrides?: Partial<OidcProviderConfig>;
        userInfo?: Record<string, unknown> | null;
        tokenResponseOverrides?: Record<string, unknown>;
      } = {},
    ) {
      const discovery: Record<string, unknown> = {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/auth`,
        token_endpoint: TOKEN_ENDPOINT,
        userinfo_endpoint: USERINFO_ENDPOINT,
        jwks_uri: JWKS_URI,
        ...opts.discoveryOverrides,
      };

      const claims = opts.idTokenClaims ?? {
        sub: 'subject-1',
        email: 'user@example.com',
        preferred_username: 'user',
        name: 'User',
      };
      let idToken: string | undefined;
      if (opts.tokenResponseOverrides && 'id_token' in opts.tokenResponseOverrides) {
        const overrideVal = (opts.tokenResponseOverrides as Record<string, unknown>).id_token;
        if (typeof overrideVal === 'string') idToken = overrideVal as string;
        else if (overrideVal === null || overrideVal === undefined) idToken = undefined;
        else idToken = await signIdToken(claims, opts.idTokenOpts);
      } else {
        idToken = await signIdToken(claims, opts.idTokenOpts);
        if (opts.idTokenOpts?.tamper) {
          idToken = idToken.slice(0, -5) + 'aaaaa';
        }
      }

      const tokenResponse: Record<string, unknown> = {
        access_token: 'access-token-1',
        refresh_token: 'refresh-1',
        expires_in: 300,
        ...opts.tokenResponseOverrides,
      };
      if (idToken !== undefined) (tokenResponse as Record<string, unknown>).id_token = idToken;
      else delete (tokenResponse as Record<string, unknown>).id_token;

      const userInfo =
        opts.userInfo !== undefined
          ? opts.userInfo
          : { sub: 'subject-1', email: 'user@example.com', roles: 'global:member' };
      const jwksUriForTest = (discovery.jwks_uri as string) || (opts.configOverrides?.jwksUri as string) || JWKS_URI;
      const discoveryUrl = `${ISSUER}/.well-known/openid-configuration`;

      const toUrlString = (input: RequestInfo | URL) => {
        if (typeof input === 'string') return input;
        if (input instanceof URL) return input.href;
        if (input instanceof Request) return input.url;
        return String(input);
      };

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = toUrlString(input);
        if (url === discoveryUrl) {
          return { ok: true, status: 200, json: async () => discovery } as Response;
        }
        if (url === TOKEN_ENDPOINT) {
          return { ok: true, status: 200, json: async () => tokenResponse } as Response;
        }
        if (url === USERINFO_ENDPOINT) {
          if (userInfo === null) return { ok: false, status: 404 } as Response;
          return { ok: true, status: 200, json: async () => userInfo } as Response;
        }
        if (url === jwksUriForTest) {
          return { ok: true, status: 200, json: async () => ({ keys: [publicJwk] }) } as Response;
        }
        // Handle alternate JWKS uri if overridden
        if (url === JWKS_URI && jwksUriForTest !== JWKS_URI) {
          return { ok: true, status: 200, json: async () => ({ keys: [publicJwk] }) } as Response;
        }
        throw new Error(`Unhandled fetch url in test: ${url}`);
      }) as unknown as typeof fetch;

      const config = createBaseConfig(opts.configOverrides);
      // Adjust config's issuerUrl if discoveryOverrides changes issuer for mismatch tests that use discovery fetch
      return { discovery, tokenResponse, userInfo, idToken, config };
    }

    it('fails when id_token is missing', async () => {
      const tokenResponse: Record<string, unknown> = { access_token: 'access-token-1' };
      const config = createBaseConfig();
      const discovery = {
        issuer: ISSUER,
        token_endpoint: TOKEN_ENDPOINT,
        userinfo_endpoint: USERINFO_ENDPOINT,
        jwks_uri: JWKS_URI,
      };
      const discoveryUrl = `${ISSUER}/.well-known/openid-configuration`;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = toUrlString(input);
        if (url === discoveryUrl) return { ok: true, status: 200, json: async () => discovery } as Response;
        if (url === TOKEN_ENDPOINT) return { ok: true, status: 200, json: async () => tokenResponse } as Response;
        if (url === JWKS_URI) return { ok: true, status: 200, json: async () => ({ keys: [publicJwk] }) } as Response;
        if (url === USERINFO_ENDPOINT)
          return {
            ok: true,
            status: 200,
            json: async () => ({ sub: 'subject-1', email: 'user@example.com' }),
          } as Response;
        throw new Error(`unhandled ${url}`);
      }) as unknown as typeof fetch;

      await expect(
        completeOidcAuthorization({
          code: 'code-1',
          storedState: { nonce: NONCE, redirectUri: config.redirectUri },
          config,
        }),
      ).rejects.toThrow(/Missing ID token/);
    });

    it('fails when JWKS URI is missing', async () => {
      const config = createBaseConfig({ jwksUri: '' });
      const discovery = { issuer: ISSUER, token_endpoint: TOKEN_ENDPOINT, userinfo_endpoint: USERINFO_ENDPOINT };
      const discoveryUrl = `${ISSUER}/.well-known/openid-configuration`;
      // Actually config issuerUrl set, so discovery fetch path; we provide discovery without jwks_uri and config without jwks
      const idToken = await signIdToken({ sub: 'subject-1', email: 'user@example.com' });
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = toUrlString(input);
        if (url === discoveryUrl) return { ok: true, status: 200, json: async () => discovery } as Response;
        if (url === TOKEN_ENDPOINT)
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: 'access-token-1', id_token: idToken }),
          } as Response;
        throw new Error(`unhandled ${url}`);
      }) as unknown as typeof fetch;

      await expect(
        completeOidcAuthorization({
          code: 'code-1',
          storedState: { nonce: NONCE, redirectUri: config.redirectUri },
          config,
        }),
      ).rejects.toThrow(/JWKS URI/);
    });

    it('fails on unsigned/tampered token', async () => {
      const { config } = await setupMocks({ idTokenOpts: { tamper: true } });
      await expect(
        completeOidcAuthorization({
          code: 'code-1',
          storedState: { nonce: NONCE, redirectUri: config.redirectUri },
          config,
        }),
      ).rejects.toThrow();
    });

    it('fails on expired token', async () => {
      const { config } = await setupMocks({ idTokenOpts: { expiresIn: '-1h' } });
      await expect(
        completeOidcAuthorization({
          code: 'code-1',
          storedState: { nonce: NONCE, redirectUri: config.redirectUri },
          config,
        }),
      ).rejects.toThrow();
    });

    it('fails on issuer mismatch', async () => {
      const { config } = await setupMocks({ idTokenOpts: { issuer: 'https://evil.example.com' } });
      await expect(
        completeOidcAuthorization({
          code: 'code-1',
          storedState: { nonce: NONCE, redirectUri: config.redirectUri },
          config,
        }),
      ).rejects.toThrow(/iss/i);
    });

    it('fails on discovery issuer mismatch', async () => {
      const config = createBaseConfig();
      const discovery = {
        issuer: 'https://evil.example.com',
        token_endpoint: TOKEN_ENDPOINT,
        userinfo_endpoint: USERINFO_ENDPOINT,
        jwks_uri: JWKS_URI,
      };
      const discoveryUrl = `${ISSUER}/.well-known/openid-configuration`;
      const idToken = await signIdToken({ sub: 'subject-1', email: 'user@example.com' });
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = toUrlString(input);
        if (url === discoveryUrl) return { ok: true, status: 200, json: async () => discovery } as Response;
        if (url === TOKEN_ENDPOINT)
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: 'access-token-1', id_token: idToken }),
          } as Response;
        if (url === JWKS_URI) return { ok: true, status: 200, json: async () => ({ keys: [publicJwk] }) } as Response;
        if (url === USERINFO_ENDPOINT)
          return {
            ok: true,
            status: 200,
            json: async () => ({ sub: 'subject-1', email: 'user@example.com' }),
          } as Response;
        throw new Error(`unhandled ${url}`);
      }) as unknown as typeof fetch;

      await expect(
        completeOidcAuthorization({
          code: 'code-1',
          storedState: { nonce: NONCE, redirectUri: config.redirectUri },
          config,
        }),
      ).rejects.toThrow(/discovery issuer mismatch/i);
    });

    it('fails on audience mismatch', async () => {
      const { config } = await setupMocks({ idTokenOpts: { audience: 'other-client' } });
      await expect(
        completeOidcAuthorization({
          code: 'code-1',
          storedState: { nonce: NONCE, redirectUri: config.redirectUri },
          config,
        }),
      ).rejects.toThrow();
    });

    it('fails on nonce mismatch', async () => {
      const { config } = await setupMocks({ idTokenOpts: { nonce: 'wrong-nonce' } });
      await expect(
        completeOidcAuthorization({
          code: 'code-1',
          storedState: { nonce: NONCE, redirectUri: config.redirectUri },
          config,
        }),
      ).rejects.toThrow(/Invalid nonce/);
    });

    it('fails when userinfo sub is missing', async () => {
      const { config } = await setupMocks({ userInfo: { email: 'user@example.com' } as any });
      await expect(
        completeOidcAuthorization({
          code: 'code-1',
          storedState: { nonce: NONCE, redirectUri: config.redirectUri },
          config,
        }),
      ).rejects.toThrow(/userinfo.*missing sub/i);
    });

    it('fails when userinfo sub mismatches ID token subject', async () => {
      const { config } = await setupMocks({ userInfo: { sub: 'other-subject', email: 'user@example.com' } });
      await expect(
        completeOidcAuthorization({
          code: 'code-1',
          storedState: { nonce: NONCE, redirectUri: config.redirectUri },
          config,
        }),
      ).rejects.toThrow(/userinfo sub mismatch/i);
    });

    it('succeeds with valid signed ID token and matching userinfo', async () => {
      const { config } = await setupMocks({});
      const result = await completeOidcAuthorization({
        code: 'code-1',
        storedState: { nonce: NONCE, redirectUri: config.redirectUri },
        config,
      });
      expect(result.idTokenClaims).toBeTruthy();
      expect(result.idTokenClaims?.sub).toBe('subject-1');
      expect(result.userInfo?.sub).toBe('subject-1');
      expect(result.mergedClaims.sub).toBe('subject-1');
      expect(result.mergedClaims.email).toBe('user@example.com');
    });

    it('merged claims keep ID-token authoritative values over userinfo', async () => {
      const { config } = await setupMocks({
        idTokenClaims: { sub: 'subject-1', email: 'id@example.com', roles: 'global:admin' },
        userInfo: { sub: 'subject-1', email: 'evil@example.com', roles: 'global:member', extra: 'from-userinfo' },
      });
      const result = await completeOidcAuthorization({
        code: 'code-1',
        storedState: { nonce: NONCE, redirectUri: config.redirectUri },
        config,
      });
      expect(result.mergedClaims.email).toBe('id@example.com');
      expect(result.mergedClaims.extra).toBe('from-userinfo');
      expect(result.mergedClaims.roles).toBe('global:admin');
      expect((result.mergedClaims as any).sub).toBe('subject-1');
    });

    it('uses userinfo email when ID token has no email', async () => {
      const { config } = await setupMocks({
        idTokenClaims: { sub: 'subject-1' } as any,
        userInfo: { sub: 'subject-1', email: 'userinfo@example.com' },
      });
      const result = await completeOidcAuthorization({
        code: 'code-1',
        storedState: { nonce: NONCE, redirectUri: config.redirectUri },
        config,
      });
      expect(result.mergedClaims.email).toBe('userinfo@example.com');
    });
  });
});
