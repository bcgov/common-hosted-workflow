import { afterEach, describe, expect, it, vi } from 'vitest';

describe('session actions', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('opens n8n through the configured API base URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/n8n-api');
    const { getN8nLoginUrl } = await import('../src/auth/session-actions');

    expect(getN8nLoginUrl()).toBe('https://api.example.test/n8n-api/rest/auth/oidc/login');
  });
});
