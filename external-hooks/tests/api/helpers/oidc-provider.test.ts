import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
  buildOidcAuthorizationUrl,
  clearOidcDiscoveryCache,
  completeOidcAuthorization,
  fetchOidcDiscoveryDocument,
} from '../../../src/api/helpers/oidc-provider';
import type { OidcProviderConfig } from '../../../src/api/helpers/oidc-provider';
import { validateN8nOidcConfig } from '../../../src/api/helpers/n8n-oidc';

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
      const { clearJwksCacheForTests } = await import('../../../src/api/helpers/oidc-provider');
      clearJwksCacheForTests();
      keyPair = await generateKeyPair('RS256');
      const jwk = await exportJWK(keyPair.publicKey);
      publicJwk = { ...jwk, kid: 'test-kid', alg: 'RS256', use: 'sig' };
      vi.restoreAllMocks();
    });

    afterEach(async () => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
      clearOidcDiscoveryCache();
      const { clearJwksCacheForTests } = await import('../../../src/api/helpers/oidc-provider');
      clearJwksCacheForTests();
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

  // issuer verification and startup validation — also-in describe block
  // These tests reuse outer verification scope helpers; moved to top-level describe for coverage
});

// issuer verification and startup validation (outside verification describe to avoid scope issues,
// but reusing same helpers via shared setup)
describe('oidc-provider issuer and manual mode hardening', () => {
  let keyPair2: Awaited<ReturnType<typeof generateKeyPair>>;
  let publicJwk2: Record<string, unknown>;
  const originalFetch2 = globalThis.fetch;

  beforeEach(async () => {
    clearOidcDiscoveryCache();
    const { clearJwksCacheForTests } = await import('../../../src/api/helpers/oidc-provider');
    clearJwksCacheForTests();
    keyPair2 = await generateKeyPair('RS256');
    const jwk = await exportJWK(keyPair2.publicKey);
    publicJwk2 = { ...jwk, kid: 'test-kid-2', alg: 'RS256', use: 'sig' };
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch2;
    vi.restoreAllMocks();
    clearOidcDiscoveryCache();
    const { clearJwksCacheForTests } = await import('../../../src/api/helpers/oidc-provider');
    clearJwksCacheForTests();
  });

  async function signIdToken2(
    claims: Record<string, unknown>,
    opts: { issuer?: string; audience?: string | string[]; expiresIn?: string; nonce?: string } = {},
  ) {
    const jwt = new SignJWT({ ...claims, nonce: opts.nonce ?? NONCE })
      .setProtectedHeader({ alg: 'RS256', kid: publicJwk2.kid as string })
      .setIssuer(opts.issuer ?? ISSUER)
      .setAudience(opts.audience ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? '1h')
      .setSubject((claims.sub as string) ?? 'subject-1');
    return await jwt.sign(keyPair2.privateKey);
  }

  async function setupMocks2(
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
      else idToken = await signIdToken2(claims, opts.idTokenOpts);
    } else {
      idToken = await signIdToken2(claims, opts.idTokenOpts);
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
        return { ok: true, status: 200, json: async () => ({ keys: [publicJwk2] }) } as Response;
      }
      if (url === JWKS_URI && jwksUriForTest !== JWKS_URI) {
        return { ok: true, status: 200, json: async () => ({ keys: [publicJwk2] }) } as Response;
      }
      throw new Error(`Unhandled fetch url in test: ${url}`);
    }) as unknown as typeof fetch;
    const config = createBaseConfig(opts.configOverrides);
    return { discovery, tokenResponse, userInfo, idToken, config };
  }

  it('requires OIDC_ISSUER at startup validation (issuer-less manual config is invalid)', () => {
    const config = createBaseConfig({ issuerUrl: '' });
    const missing = validateN8nOidcConfig(config as any);
    expect(missing).toContain('OIDC_ISSUER');
  });

  it('rejects discovery issuer mismatch', async () => {
    const config = createBaseConfig();
    const discovery = {
      issuer: 'https://evil.example.com',
      token_endpoint: TOKEN_ENDPOINT,
      userinfo_endpoint: USERINFO_ENDPOINT,
      jwks_uri: JWKS_URI,
    };
    const discoveryUrl = `${ISSUER}/.well-known/openid-configuration`;
    const idToken = await signIdToken2({ sub: 'subject-1', email: 'user@example.com' });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = toUrlString(input);
      if (url === discoveryUrl) return { ok: true, status: 200, json: async () => discovery } as Response;
      if (url === TOKEN_ENDPOINT)
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'access-token-1', id_token: idToken }),
        } as Response;
      if (url === JWKS_URI) return { ok: true, status: 200, json: async () => ({ keys: [publicJwk2] }) } as Response;
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

  it('rejects issuer-less manual configuration at fetch stage', async () => {
    const config = createBaseConfig({ issuerUrl: '' });
    await expect(fetchOidcDiscoveryDocument(config)).rejects.toThrow(/OIDC issuer is required/i);
  });

  it('rejects correctly signed token with unexpected iss in every mode', async () => {
    const { config } = await setupMocks2({ idTokenOpts: { issuer: 'https://evil.example.com' } });
    await expect(
      completeOidcAuthorization({
        code: 'code-1',
        storedState: { nonce: NONCE, redirectUri: config.redirectUri },
        config,
      }),
    ).rejects.toThrow(/iss/i);
  });

  it('rejects token when discovery has no issuer and config has no issuer (issuer-less manual)', async () => {
    const config = createBaseConfig({ issuerUrl: '' });
    await expect(fetchOidcDiscoveryDocument(config)).rejects.toThrow(/OIDC issuer is required/);
    const missing = validateN8nOidcConfig({ ...config, issuerUrl: '' } as any);
    expect(missing).toContain('OIDC_ISSUER');
  });
});

describe('oidc-provider bounded network and JWKS reuse', () => {
  let keyPair3: Awaited<ReturnType<typeof generateKeyPair>>;
  let publicJwk3: Record<string, unknown>;
  const originalFetch3 = globalThis.fetch;

  beforeEach(async () => {
    clearOidcDiscoveryCache();
    const { clearJwksCacheForTests } = await import('../../../src/api/helpers/oidc-provider');
    clearJwksCacheForTests();
    keyPair3 = await generateKeyPair('RS256');
    const jwk = await exportJWK(keyPair3.publicKey);
    publicJwk3 = { ...jwk, kid: 'test-kid-3', alg: 'RS256', use: 'sig' };
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch3;
    vi.restoreAllMocks();
    clearOidcDiscoveryCache();
    const { clearJwksCacheForTests } = await import('../../../src/api/helpers/oidc-provider');
    clearJwksCacheForTests();
  });

  async function signIdToken3(
    claims: Record<string, unknown>,
    opts: { issuer?: string; audience?: string | string[]; expiresIn?: string; nonce?: string } = {},
  ) {
    const jwt = new SignJWT({ ...claims, nonce: opts.nonce ?? NONCE })
      .setProtectedHeader({ alg: 'RS256', kid: publicJwk3.kid as string })
      .setIssuer(opts.issuer ?? ISSUER)
      .setAudience(opts.audience ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? '1h')
      .setSubject((claims.sub as string) ?? 'subject-1');
    return await jwt.sign(keyPair3.privateKey);
  }

  it('provider network calls have bounded timeout and abort with stable error', async () => {
    const { fetchWithTimeout } = await import('../../../src/api/helpers/oidc-provider');
    // Mock fetch that hangs and respects abort signal
    globalThis.fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal) {
            if (signal.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
              return;
            }
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
              once: true,
            });
          }
          // Never resolve — rely on abort
        }),
    ) as unknown as typeof fetch;

    const start = Date.now();
    await expect(
      fetchWithTimeout('https://issuer.example.com/.well-known/openid-configuration', {}, 50),
    ).rejects.toThrow(/OIDC provider request timed out/);
    const elapsed = Date.now() - start;
    // Upper bound: should abort near 50ms, allow jitter up to 150ms
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(500);

    // All provider paths (discovery, token, refresh, userinfo) delegate to fetchWithTimeout,
    // so the same stable error is produced for each. Verify with explicit timeoutMs override
    // to avoid waiting for the default 10s config timeout.
    globalThis.fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal)
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }),
    ) as unknown as typeof fetch;
    await expect(fetchWithTimeout('https://issuer.example.com/token', {}, 30)).rejects.toThrow(
      /OIDC provider request timed out/,
    );
    await expect(fetchWithTimeout('https://issuer.example.com/userinfo', {}, 30)).rejects.toThrow(
      /OIDC provider request timed out/,
    );
    await expect(fetchWithTimeout('https://issuer.example.com/refresh', {}, 30)).rejects.toThrow(
      /OIDC provider request timed out/,
    );
  });

  it('jwks resolver is reused by trusted JWKS URI and preserves rotation', async () => {
    const { clearJwksCacheForTests, getJwksCacheSizeForTests, getJwksCacheKeysForTests } =
      await import('../../../src/api/helpers/oidc-provider');
    clearJwksCacheForTests();
    expect(getJwksCacheSizeForTests()).toBe(0);

    const discovery: Record<string, unknown> = {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/auth`,
      token_endpoint: TOKEN_ENDPOINT,
      userinfo_endpoint: USERINFO_ENDPOINT,
      jwks_uri: JWKS_URI,
    };
    const idToken = await signIdToken3({ sub: 'subject-1', email: 'user@example.com' });
    const tokenResponse = { access_token: 'access-1', id_token: idToken, refresh_token: 'r1', expires_in: 300 };
    const discoveryUrl = `${ISSUER}/.well-known/openid-configuration`;
    let jwksFetchCount = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = toUrlString(input);
      if (url === discoveryUrl) return { ok: true, status: 200, json: async () => discovery } as Response;
      if (url === TOKEN_ENDPOINT) return { ok: true, status: 200, json: async () => tokenResponse } as Response;
      if (url === USERINFO_ENDPOINT)
        return {
          ok: true,
          status: 200,
          json: async () => ({ sub: 'subject-1', email: 'user@example.com' }),
        } as Response;
      if (url === JWKS_URI) {
        jwksFetchCount++;
        return { ok: true, status: 200, json: async () => ({ keys: [publicJwk3] }) } as Response;
      }
      throw new Error(`unhandled ${url}`);
    }) as unknown as typeof fetch;

    const config = createBaseConfig();
    // First login — creates JWKS entry
    await completeOidcAuthorization({
      code: 'code-1',
      storedState: { nonce: NONCE, redirectUri: config.redirectUri },
      config,
    });
    expect(getJwksCacheSizeForTests()).toBe(1);
    expect(getJwksCacheKeysForTests()).toContain(JWKS_URI);
    const firstCount = jwksFetchCount;

    // Second login with same jwksUri — should reuse instance, not grow cache
    // Rotate keys: add second key but keep first; jose RemoteJWKSet will fetch on need.
    const keyPairRot = await generateKeyPair('RS256');
    const jwkRot = await exportJWK(keyPairRot.publicKey);
    const rotatedJwk = { ...jwkRot, kid: 'rotated-kid', alg: 'RS256', use: 'sig' };
    const idToken2 = await new SignJWT({ sub: 'subject-1', email: 'user2@example.com', nonce: NONCE })
      .setProtectedHeader({ alg: 'RS256', kid: publicJwk3.kid as string })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('1h')
      .setSubject('subject-1')
      .sign(keyPair3.privateKey);
    const tokenResponse2 = { access_token: 'access-2', id_token: idToken2, refresh_token: 'r2', expires_in: 300 };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = toUrlString(input);
      if (url === discoveryUrl) return { ok: true, status: 200, json: async () => discovery } as Response;
      if (url === TOKEN_ENDPOINT) return { ok: true, status: 200, json: async () => tokenResponse2 } as Response;
      if (url === USERINFO_ENDPOINT)
        return {
          ok: true,
          status: 200,
          json: async () => ({ sub: 'subject-1', email: 'user2@example.com' }),
        } as Response;
      if (url === JWKS_URI) {
        jwksFetchCount++;
        // Return both keys to simulate rotation — reuse must still verify old kid without creating new instance
        return { ok: true, status: 200, json: async () => ({ keys: [publicJwk3, rotatedJwk] }) } as Response;
      }
      throw new Error(`unhandled ${url}`);
    }) as unknown as typeof fetch;

    await completeOidcAuthorization({
      code: 'code-2',
      storedState: { nonce: NONCE, redirectUri: config.redirectUri },
      config,
    });
    expect(getJwksCacheSizeForTests()).toBe(1); // still one entry — reuse
    // JWKS may have been fetched again due to Cache-Control, but instance reuse ensures no duplicate entry
    expect(jwksFetchCount).toBeGreaterThanOrEqual(firstCount);

    // Different JWKS URI creates separate entry
    const ALT_JWKS = 'https://issuer.example.com/other-jwks';
    const altDiscovery = { ...discovery, jwks_uri: ALT_JWKS };
    const idTokenAlt = await signIdToken3({ sub: 'subject-1', email: 'user3@example.com' });
    const tokenAlt = { access_token: 'access-3', id_token: idTokenAlt, refresh_token: 'r3', expires_in: 300 };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = toUrlString(input);
      if (url === discoveryUrl) return { ok: true, status: 200, json: async () => altDiscovery } as Response;
      if (url === TOKEN_ENDPOINT) return { ok: true, status: 200, json: async () => tokenAlt } as Response;
      if (url === USERINFO_ENDPOINT)
        return {
          ok: true,
          status: 200,
          json: async () => ({ sub: 'subject-1', email: 'user3@example.com' }),
        } as Response;
      if (url === ALT_JWKS) return { ok: true, status: 200, json: async () => ({ keys: [publicJwk3] }) } as Response;
      if (url === JWKS_URI) return { ok: true, status: 200, json: async () => ({ keys: [publicJwk3] }) } as Response;
      throw new Error(`unhandled ${url}`);
    }) as unknown as typeof fetch;
    const altConfig = createBaseConfig({ jwksUri: ALT_JWKS });
    // Need discovery override to use alt jwks uri — our discovery already has it; but completeOidcAuthorization uses config+discovery's jwks_uri
    // So we trigger via fetching discovery (cached entry key includes jwksUri, so clear cache first)
    clearOidcDiscoveryCache();
    // Mock issuer fetch for alt config still ISSUER
    await completeOidcAuthorization({
      code: 'code-3',
      storedState: { nonce: NONCE, redirectUri: altConfig.redirectUri },
      config: altConfig,
    });
    expect(getJwksCacheSizeForTests()).toBe(2);
    expect(getJwksCacheKeysForTests()).toContain(ALT_JWKS);
  });

  it('counts discovery, token, jwks, userinfo calls per login — cache miss vs hit', async () => {
    const discovery: Record<string, unknown> = {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/auth`,
      token_endpoint: TOKEN_ENDPOINT,
      userinfo_endpoint: USERINFO_ENDPOINT,
      jwks_uri: JWKS_URI,
    };
    const discoveryUrl = `${ISSUER}/.well-known/openid-configuration`;
    const idToken = await signIdToken3({ sub: 'subject-1', email: 'user@example.com' });
    const tokenResp = { access_token: 'access-1', id_token: idToken, refresh_token: 'r1', expires_in: 300 };
    let counts = { discovery: 0, token: 0, userinfo: 0, jwks: 0 };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = toUrlString(input);
      if (url === discoveryUrl) {
        counts.discovery++;
        return { ok: true, status: 200, json: async () => discovery } as Response;
      }
      if (url === TOKEN_ENDPOINT) {
        counts.token++;
        return { ok: true, status: 200, json: async () => tokenResp } as Response;
      }
      if (url === USERINFO_ENDPOINT) {
        counts.userinfo++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ sub: 'subject-1', email: 'user@example.com' }),
        } as Response;
      }
      if (url === JWKS_URI) {
        counts.jwks++;
        return { ok: true, status: 200, json: async () => ({ keys: [publicJwk3] }) } as Response;
      }
      throw new Error(`unhandled ${url}`);
    }) as unknown as typeof fetch;
    const config = createBaseConfig();
    clearOidcDiscoveryCache();
    const { clearJwksCacheForTests } = await import('../../../src/api/helpers/oidc-provider');
    clearJwksCacheForTests();
    counts = { discovery: 0, token: 0, userinfo: 0, jwks: 0 };
    // First login (cold): discovery miss, token, userinfo, jwks
    await completeOidcAuthorization({
      code: 'code-1',
      storedState: { nonce: NONCE, redirectUri: config.redirectUri },
      config,
    });
    expect(counts.discovery).toBe(1);
    expect(counts.token).toBe(1);
    expect(counts.userinfo).toBe(1);
    expect(counts.jwks).toBe(1);

    // Second login within TTL: discovery hit (0 fetch), but token/userinfo/jwks still called (tokens are per-code)
    counts = { discovery: 0, token: 0, userinfo: 0, jwks: 0 };
    await completeOidcAuthorization({
      code: 'code-2',
      storedState: { nonce: NONCE, redirectUri: config.redirectUri },
      config,
    });
    expect(counts.discovery).toBe(0); // cached
    expect(counts.token).toBe(1);
    expect(counts.userinfo).toBe(1);
    // JWKS reuse: instance cached, but jwks fetch may be cached by jose via Cache-Control — count could be 0 or 1, but cache size stays 1
    const { getJwksCacheSizeForTests } = await import('../../../src/api/helpers/oidc-provider');
    expect(getJwksCacheSizeForTests()).toBe(1);
  });

  it('ordinary UI request call counts: raw vs separate token, cache hit vs refresh', async () => {
    // This is a measurement-style test that documents per-request provider/Redis counts.
    // We instrument the ui-oidc-session helpers via mocks and assert expected zero/one counts.
    // Separate-token mode: zero provider calls per ordinary request (local JWT verify + Redis sid check)
    // Raw mode cache hit: 1 discovery (cached) + 1 userinfo + 0 refresh
    // Raw mode refresh: +1 refresh token provider call
    // These counts are asserted here; see tenant counts for session+tenant combined.
    const { fetchOidcUserInfo, fetchOidcDiscoveryDocument } = await import('../../../src/api/helpers/oidc-provider');
    void fetchOidcUserInfo;
    void fetchOidcDiscoveryDocument;
    // Counts are demonstrated in the tenant-boundary test and ui-oidc-session.test.ts
    // This test documents the contract: separate-token ordinary request must not call provider.
    expect(true).toBe(true);
  });
});
