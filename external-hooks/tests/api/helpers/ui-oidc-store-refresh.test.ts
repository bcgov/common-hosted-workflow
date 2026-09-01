import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    getDel: vi.fn().mockResolvedValue(null),
  };
}

describe('ui-oidc-store refresh token TTL capping (OIDC-07)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    createClientMock.mockReset();
  });

  it('caps refresh token TTL to provider validity when refresh_expires_in is short', async () => {
    vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
    const redisClient = createMockRedisClient();
    createClientMock.mockReturnValue(redisClient);

    const { setUiOidcRefreshTokenWithExpiry } = await import('../../../src/api/helpers/ui-oidc-store');
    const expiresAt = Date.now() + 3600_000; // 1 hour
    await setUiOidcRefreshTokenWithExpiry('user@example.com', 'refresh-token-123', expiresAt);

    expect(redisClient.set).toHaveBeenCalledWith(
      expect.stringContaining('reftoken:'),
      expect.any(String),
      expect.objectContaining({ PX: expect.any(Number) }),
    );
    const ttl = redisClient.set.mock.calls[0][2].PX as number;
    // Should be approx 1 hour (3600000), not 30 days
    expect(ttl).toBeGreaterThan(3500_000);
    expect(ttl).toBeLessThanOrEqual(3600_000);
  });

  it('caps refresh token TTL to 30-day max when provider validity is longer than max', async () => {
    vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
    const redisClient = createMockRedisClient();
    createClientMock.mockReturnValue(redisClient);

    const { setUiOidcRefreshTokenWithExpiry } = await import('../../../src/api/helpers/ui-oidc-store');
    const expiresAt = Date.now() + 60 * 24 * 60 * 60 * 1000; // 60 days
    await setUiOidcRefreshTokenWithExpiry('user@example.com', 'refresh-token-123', expiresAt);

    expect(redisClient.set).toHaveBeenCalledWith(expect.stringContaining('reftoken:'), expect.any(String), {
      PX: 30 * 24 * 60 * 60 * 1000,
    });
  });

  it('stores refresh token with default 30-day TTL when no provider expiry given', async () => {
    vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
    const redisClient = createMockRedisClient();
    createClientMock.mockReturnValue(redisClient);

    const { setUiOidcRefreshTokenWithExpiry } = await import('../../../src/api/helpers/ui-oidc-store');
    await setUiOidcRefreshTokenWithExpiry('user@example.com', 'refresh-token-123', undefined);

    expect(redisClient.set).toHaveBeenCalledWith(expect.stringContaining('reftoken:'), expect.any(String), {
      PX: 30 * 24 * 60 * 60 * 1000,
    });
  });

  it('never exceeds provider validity even when ttlMs larger is requested', async () => {
    vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
    const redisClient = createMockRedisClient();
    createClientMock.mockReturnValue(redisClient);

    const { setUiOidcRefreshTokenWithExpiry } = await import('../../../src/api/helpers/ui-oidc-store');
    const expiresAt = Date.now() + 5000; // 5 seconds
    await setUiOidcRefreshTokenWithExpiry('user@example.com', 'refresh-token-123', expiresAt, 30 * 24 * 60 * 60 * 1000);

    const ttl = redisClient.set.mock.calls[0][2].PX as number;
    expect(ttl).toBeLessThanOrEqual(5000);
    expect(ttl).toBeGreaterThanOrEqual(1);
  });

  it('persistOidcTokensDefault batches writes via Promise.all and preserves refresh_expires_in', async () => {
    vi.stubEnv('UI_OIDC_REDIS_URL', 'redis://redis:6379');
    const redisClient = createMockRedisClient();
    createClientMock.mockReturnValue(redisClient);

    const { persistOidcTokensDefault } = await import('../../../src/api/services/oidc-login-coordinator');
    const expiresIn = 300; // 5 min for access
    const refreshExpiresIn = 3600; // 1 hour for refresh
    const accessExpiresAt = Date.now() + expiresIn * 1000;

    await persistOidcTokensDefault(
      'user@example.com',
      {
        refresh_token: 'refresh-1',
        id_token: 'header.eyJleHAiOjQ3MDAwMDAwMDB9.sig',
        access_token: 'access-1',
        refresh_expires_in: refreshExpiresIn,
        expires_in: expiresIn,
      },
      accessExpiresAt,
    );

    // Refresh, ID, and access token (access does 2 sets: by-email + by-token) => total 4
    expect(redisClient.set).toHaveBeenCalledTimes(4);
    const refreshCall = redisClient.set.mock.calls.find(([k]) => String(k).includes('reftoken:'));
    expect(refreshCall).toBeDefined();
    const refreshTtl = refreshCall![2].PX as number;
    expect(refreshTtl).toBeGreaterThan(3500_000);
    expect(refreshTtl).toBeLessThanOrEqual(3600_000);
    // Verify record contains expiresAt
    const refreshPayload = JSON.parse(refreshCall![1] as string);
    expect(refreshPayload.expiresAt).toBeGreaterThan(Date.now());
  });
});
