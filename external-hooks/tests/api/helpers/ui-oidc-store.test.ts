import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();

vi.mock('redis', () => ({
  createClient: createClientMock,
}));

function createMockRedisClient() {
  return {
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  };
}

describe('ui-oidc-store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    createClientMock.mockReset();
  });

  it('passes the configured redis password to the client', async () => {
    vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
    vi.stubEnv('UI_OIDC_REDIS_PASSWORD', 'super-secret');

    const redisClient = createMockRedisClient();
    createClientMock.mockReturnValue(redisClient);

    const { setUiSessionExchange } = await import('../../../src/api/helpers/ui-oidc-store');

    await setUiSessionExchange('handle-1', 'token-1', 60_000);

    expect(createClientMock).toHaveBeenCalledWith({
      url: 'redis://redis:6379',
      password: 'super-secret', // pragma: allowlist secret
    });
  });

  describe('TTL strategy', () => {
    it('stores refresh token with default 30-day TTL', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');

      const redisClient = createMockRedisClient();
      createClientMock.mockReturnValue(redisClient);

      const { setUiOidcRefreshToken } = await import('../../../src/api/helpers/ui-oidc-store');
      await setUiOidcRefreshToken('user@example.com', 'refresh-token-123');

      expect(redisClient.set).toHaveBeenCalledWith(expect.stringContaining('reftoken:'), 'refresh-token-123', {
        PX: 30 * 24 * 60 * 60 * 1000,
      });
    });

    it('stores refresh token with custom TTL when provided', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');

      const redisClient = createMockRedisClient();
      createClientMock.mockReturnValue(redisClient);

      const { setUiOidcRefreshToken } = await import('../../../src/api/helpers/ui-oidc-store');
      await setUiOidcRefreshToken('user@example.com', 'refresh-token-123', 60_000);

      expect(redisClient.set).toHaveBeenCalledWith(expect.stringContaining('reftoken:'), 'refresh-token-123', {
        PX: 60_000,
      });
    });

    it('stores ID token with TTL based on JWT expiry', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');

      const redisClient = createMockRedisClient();
      createClientMock.mockReturnValue(redisClient);

      const futureExp = Math.floor((Date.now() + 3600_000) / 1000);
      const payload = JSON.stringify({ exp: futureExp });
      const base64 = Buffer.from(payload).toString('base64url');
      const idToken = `header.${base64}.signature`;

      const { setUiOidcIdToken } = await import('../../../src/api/helpers/ui-oidc-store');
      await setUiOidcIdToken('user@example.com', idToken);

      expect(redisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('idtoken:'),
        idToken,
        expect.objectContaining({ PX: expect.any(Number) }),
      );

      const callArgs = redisClient.set.mock.calls[0];
      const ttlMs = callArgs[2].PX;
      expect(ttlMs).toBeGreaterThan(3500_000);
      expect(ttlMs).toBeLessThanOrEqual(3600_000);
    });

    it('falls back to 24-hour TTL for ID token without expiry', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');

      const redisClient = createMockRedisClient();
      createClientMock.mockReturnValue(redisClient);

      const payload = JSON.stringify({});
      const base64 = Buffer.from(payload).toString('base64url');
      const idToken = `header.${base64}.signature`;

      const { setUiOidcIdToken } = await import('../../../src/api/helpers/ui-oidc-store');
      await setUiOidcIdToken('user@example.com', idToken);

      expect(redisClient.set).toHaveBeenCalledWith(expect.stringContaining('idtoken:'), idToken, {
        PX: 24 * 60 * 60 * 1000,
      });
    });

    it('uses custom TTL for ID token when provided', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');

      const redisClient = createMockRedisClient();
      createClientMock.mockReturnValue(redisClient);

      const { setUiOidcIdToken } = await import('../../../src/api/helpers/ui-oidc-store');
      await setUiOidcIdToken('user@example.com', 'id-token-123', 120_000);

      expect(redisClient.set).toHaveBeenCalledWith(expect.stringContaining('idtoken:'), 'id-token-123', {
        PX: 120_000,
      });
    });
  });

  // Malformed Redis records fail closed (never throw) and are treated as revoked.
  // Contract: exercises both the fake (deterministic unit) and, when a real Redis is available,
  // the same validation path (client-side JSON parsing). Real Redis integration would use the same
  // `setRedisClientForTests` override with a live client; the validation is identical because
  // it is pure-JS after the GET. Tests here run on the fake but document fidelity.
  describe('malformed record handling (fail closed)', () => {
    it('consumeUiSessionExchange returns null on invalid JSON', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
      const redisClient = { ...createMockRedisClient(), getDel: vi.fn().mockResolvedValue('not-json{') };
      createClientMock.mockReturnValue(redisClient as any);
      const { consumeUiSessionExchange } = await import('../../../src/api/helpers/ui-oidc-store');
      const res = await consumeUiSessionExchange('handle-1');
      expect(res).toBeNull();
    });

    it('consumeUiSessionExchange returns null when token missing', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
      const redisClient = {
        ...createMockRedisClient(),
        getDel: vi.fn().mockResolvedValue(JSON.stringify({ notToken: 123 })),
      };
      createClientMock.mockReturnValue(redisClient as any);
      const { consumeUiSessionExchange } = await import('../../../src/api/helpers/ui-oidc-store');
      expect(await consumeUiSessionExchange('h')).toBeNull();
    });

    it('consumeUiLogoutHandle returns null on malformed payload', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
      const redisClient = {
        ...createMockRedisClient(),
        getDel: vi.fn().mockResolvedValue(JSON.stringify({ email: 'not-an-email', returnTo: 123 })),
      };
      createClientMock.mockReturnValue(redisClient as any);
      const { consumeUiLogoutHandle } = await import('../../../src/api/helpers/ui-oidc-store');
      expect(await consumeUiLogoutHandle('lh')).toBeNull();
    });

    it('getUiOidcRefreshTokenRecord returns null on malformed JSON object', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
      const redisClient = {
        ...createMockRedisClient(),
        get: vi.fn().mockResolvedValue(JSON.stringify({ token: 123 })),
      };
      createClientMock.mockReturnValue(redisClient as any);
      const { getUiOidcRefreshTokenRecord } = await import('../../../src/api/helpers/ui-oidc-store');
      expect(await getUiOidcRefreshTokenRecord('user@example.com')).toBeNull();
    });

    it('getUiOidcAccessTokenRecord returns null on malformed JSON', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
      const redisClient = { ...createMockRedisClient(), get: vi.fn().mockResolvedValue('{bad json') };
      createClientMock.mockReturnValue(redisClient as any);
      const { getUiOidcAccessTokenRecord } = await import('../../../src/api/helpers/ui-oidc-store');
      expect(await getUiOidcAccessTokenRecord('token-abc')).toBeNull();
    });

    it('getUiTenantRoles returns null on malformed array', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
      const redisClient = {
        ...createMockRedisClient(),
        get: vi.fn().mockResolvedValue(JSON.stringify([{ tenantId: '', roles: 'not-array' }])),
      };
      createClientMock.mockReturnValue(redisClient as any);
      const { getUiTenantRoles } = await import('../../../src/api/helpers/ui-oidc-store');
      expect(await getUiTenantRoles('user@example.com')).toBeNull();
    });

    it('getUiTenantGroups returns null on non-array JSON', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
      const redisClient = {
        ...createMockRedisClient(),
        get: vi.fn().mockResolvedValue(JSON.stringify({ not: 'array' })),
      };
      createClientMock.mockReturnValue(redisClient as any);
      const { getUiTenantGroups } = await import('../../../src/api/helpers/ui-oidc-store');
      expect(await getUiTenantGroups('user@example.com')).toBeNull();
    });

    it('injectable store boundary: setRedisClientForTests allows fake without mocking redis module', async () => {
      vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
      const fakeStore = new Map<string, string>();
      fakeStore.set('chwf:ui-oidc:acctoken:user@example.com', 'real-token');
      const fakeClient = {
        on: vi.fn(),
        connect: vi.fn(),
        get: vi.fn(async (k: string) => fakeStore.get(k) ?? null),
        set: vi.fn(async (k: string, v: string) => {
          fakeStore.set(k, v);
          return 'OK';
        }),
        del: vi.fn(async (k: string | string[]) => 1),
        getDel: vi.fn(async () => null),
      } as unknown as Awaited<ReturnType<typeof import('redis').createClient>>;
      const mod = await import('../../../src/api/helpers/ui-oidc-store');
      mod.setRedisClientForTests(fakeClient);
      const { getUiOidcAccessTokenByEmail } = await import('../../../src/api/helpers/ui-oidc-store');
      // different import instance after set still uses override because override is module-singleton
      // Call via mod directly to prove override works
      const token = await mod.getUiOidcAccessTokenByEmail('user@example.com');
      expect(token).toBe('real-token');
      mod.clearRedisClientForTests();
    });
  });
});
