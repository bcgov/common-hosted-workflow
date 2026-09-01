import { afterEach, describe, expect, it, vi } from 'vitest';

describe('session actions', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('opens n8n through the configured API base URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/n8n-api');
    const { getN8nLoginUrl } = await import('../src/auth/session-actions');

    expect(getN8nLoginUrl()).toBe('https://api.example.test/n8n-api/rest/auth/oidc/login');
  });

  it('uses the n8n OIDC endpoint as the shared login entry', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/n8n-api');
    const { getLoginUrl } = await import('../src/auth/session-actions');

    const target = new URL(getLoginUrl());
    expect(target.pathname).toBe('/n8n-api/rest/auth/oidc/login');
    expect(target.searchParams.get('returnTo')).toBe(globalThis.location.href);
  });

  describe('API base URL shapes generate exactly one correct /rest/auth/oidc/* path', () => {
    const cases: Array<{ label: string; base: string | undefined; expectedOrigin: string; expectedPath: string }> = [
      {
        label: 'unset (fallback /)',
        base: undefined,
        expectedOrigin: 'https://app.example.test',
        expectedPath: '/rest/auth/oidc/login',
      },
      { label: '"/"', base: '/', expectedOrigin: 'https://app.example.test', expectedPath: '/rest/auth/oidc/login' },
      {
        label: 'relative without trailing slash',
        base: '/api',
        expectedOrigin: 'https://app.example.test',
        expectedPath: '/api/rest/auth/oidc/login',
      },
      {
        label: 'relative with trailing slash',
        base: '/api/',
        expectedOrigin: 'https://app.example.test',
        expectedPath: '/api/rest/auth/oidc/login',
      },
      {
        label: 'relative nested without trailing slash',
        base: '/n8n-api',
        expectedOrigin: 'https://app.example.test',
        expectedPath: '/n8n-api/rest/auth/oidc/login',
      },
      {
        label: 'relative nested with trailing slash',
        base: '/n8n-api/',
        expectedOrigin: 'https://app.example.test',
        expectedPath: '/n8n-api/rest/auth/oidc/login',
      },
      {
        label: 'absolute without path',
        base: 'https://api.example.test',
        expectedOrigin: 'https://api.example.test',
        expectedPath: '/rest/auth/oidc/login',
      },
      {
        label: 'absolute without path trailing slash',
        base: 'https://api.example.test/',
        expectedOrigin: 'https://api.example.test',
        expectedPath: '/rest/auth/oidc/login',
      },
      {
        label: 'absolute with path',
        base: 'https://api.example.test/n8n-api',
        expectedOrigin: 'https://api.example.test',
        expectedPath: '/n8n-api/rest/auth/oidc/login',
      },
      {
        label: 'absolute with path trailing slash',
        base: 'https://api.example.test/n8n-api/',
        expectedOrigin: 'https://api.example.test',
        expectedPath: '/n8n-api/rest/auth/oidc/login',
      },
    ];

    it.each(cases)('handles $label', async ({ base, expectedOrigin, expectedPath }) => {
      if (base === undefined) {
        vi.stubEnv('VITE_API_BASE_URL', '');
      } else {
        vi.stubEnv('VITE_API_BASE_URL', base);
      }
      vi.stubGlobal('location', {
        href: 'https://app.example.test/ui?x=1#hash',
        origin: 'https://app.example.test',
        pathname: '/ui',
        search: '?x=1',
        hash: '#hash',
      } as unknown as Location);

      const { getN8nLoginUrl, getLoginUrl } = await import('../src/auth/session-actions');

      const n8nUrl = new URL(getN8nLoginUrl());
      expect(n8nUrl.origin).toBe(expectedOrigin);
      expect(n8nUrl.pathname).toBe(expectedPath);
      // Ensure exactly one occurrence of the OIDC segment, no doubling like /api/api/rest
      const occurrences = (n8nUrl.pathname.match(/\/rest\/auth\/oidc\/login/g) || []).length;
      expect(occurrences).toBe(1);
      expect(n8nUrl.pathname).not.toContain('//rest');

      const loginUrl = new URL(getLoginUrl());
      expect(loginUrl.origin).toBe(expectedOrigin);
      expect(loginUrl.pathname).toBe(expectedPath);
      const loginOccurrences = (loginUrl.pathname.match(/\/rest\/auth\/oidc\/login/g) || []).length;
      expect(loginOccurrences).toBe(1);
      expect(loginUrl.searchParams.get('returnTo')).toBe(globalThis.location.href);
    });

    it.each(cases)(
      'logout fallback generates exactly one /rest/auth/oidc/logout for $label',
      async ({ base, expectedOrigin, expectedPath }) => {
        const expectedLogoutPath = expectedPath.replace('/login', '/logout');
        if (base === undefined) {
          vi.stubEnv('VITE_API_BASE_URL', '');
        } else {
          vi.stubEnv('VITE_API_BASE_URL', base);
        }
        const assignSpy = vi.fn();
        vi.stubGlobal('location', {
          href: 'https://app.example.test/ui?foo=1#section',
          origin: 'https://app.example.test',
          pathname: '/ui',
          search: '?foo=1',
          hash: '#section',
          assign: assignSpy,
        } as unknown as Location);
        localStorage.setItem('external-ui.auth-token', 'tok');

        vi.doMock('../src/services/backend/auth', () => ({
          prepareLogout: vi.fn().mockRejectedValue(new Error('fail')),
        }));
        vi.doMock('../src/state/session', () => ({
          sessionState: { session: null, isLoading: false },
        }));

        const { logout } = await import('../src/auth/session-actions');
        await logout();

        expect(assignSpy).toHaveBeenCalledTimes(1);
        const dest = new URL(assignSpy.mock.calls[0][0]);
        expect(dest.origin).toBe(expectedOrigin);
        expect(dest.pathname).toBe(expectedLogoutPath);
        expect((dest.pathname.match(/\/rest\/auth\/oidc\/logout/g) || []).length).toBe(1);
        expect(dest.searchParams.get('returnTo')).toBeTruthy();
      },
    );

    it('openN8n uses single builder for relative base without doubling', async () => {
      vi.stubEnv('VITE_API_BASE_URL', '/n8n-api');
      const assignSpy = vi.fn();
      vi.stubGlobal('location', {
        href: 'https://app.example.test/ui',
        origin: 'https://app.example.test',
        pathname: '/ui',
        search: '',
        hash: '',
        assign: assignSpy,
      } as unknown as Location);

      const { openN8n } = await import('../src/auth/session-actions');
      openN8n();

      const dest = new URL(assignSpy.mock.calls[0][0]);
      expect(dest.pathname).toBe('/n8n-api/rest/auth/oidc/login');
      expect(dest.pathname).not.toContain('/n8n-api/n8n-api');
    });
  });

  it('clears browser token and redirects through handle when logout-prepare succeeds', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
    const assignSpy = vi.fn();
    vi.stubGlobal('location', {
      href: 'https://app.example.test/ui/projects?x=1',
      assign: assignSpy,
      origin: 'https://app.example.test',
      pathname: '/ui/projects',
      search: '?x=1',
      hash: '',
    } as unknown as Location);
    localStorage.setItem('external-ui.auth-token', 'stale-token');

    vi.doMock('../src/services/backend/auth', () => ({
      prepareLogout: vi
        .fn()
        .mockResolvedValue({ logoutUrl: 'https://api.example.test/rest/auth/oidc/logout?logout=handle-123' }),
    }));
    vi.doMock('../src/state/session', () => ({
      sessionState: { session: { email: 'person@example.com' }, isLoading: true },
    }));

    const { logout } = await import('../src/auth/session-actions');
    await logout();

    expect(localStorage.getItem('external-ui.auth-token')).toBeNull();
    expect(assignSpy).toHaveBeenCalledWith('https://api.example.test/rest/auth/oidc/logout?logout=handle-123');
  });

  it('clears browser token and falls back to canonical logout when prepare fails', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
    const assignSpy = vi.fn();
    vi.stubGlobal('location', {
      href: 'https://app.example.test/ui/',
      assign: assignSpy,
      origin: 'https://app.example.test',
      pathname: '/ui/',
      search: '',
      hash: '',
    } as unknown as Location);
    localStorage.setItem('external-ui.auth-token', 'stale-token');

    vi.doMock('../src/services/backend/auth', () => ({
      prepareLogout: vi.fn().mockRejectedValue(new Error('unauthorized')),
    }));
    vi.doMock('../src/state/session', () => ({
      sessionState: { session: { email: 'person@example.com' }, isLoading: true },
    }));

    const { logout } = await import('../src/auth/session-actions');
    await logout();

    expect(localStorage.getItem('external-ui.auth-token')).toBeNull();
    expect(assignSpy).toHaveBeenCalledWith(expect.stringContaining('/rest/auth/oidc/logout?returnTo='));
    expect(assignSpy).not.toHaveBeenCalledWith(expect.stringContaining('victim'));
  });
});
