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

    const { setUiOidcState } = await import('../../../src/api/helpers/ui-oidc-store');

    await setUiOidcState(
      'state-1',
      {
        nonce: 'nonce-1',
        codeVerifier: 'verifier-1',
        returnTo: '/ui',
        redirectUri: 'http://localhost:5173/ui-api/auth/callback',
      },
      60_000,
    );

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
});
