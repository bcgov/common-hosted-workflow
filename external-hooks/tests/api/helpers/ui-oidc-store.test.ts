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
});
