/* eslint-disable @typescript-eslint/no-explicit-any */
import { StrictMode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { resolveContinuationUrl, SessionBootstrap } from '../src/auth/session-bootstrap';
import { APP_AUTH_TOKEN_STORAGE_KEY } from '../src/services/backend/axios';
import { sessionState } from '../src/state/session';

const { exchangeSessionMock, getSessionMock } = vi.hoisted(() => ({
  exchangeSessionMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock('../src/services/backend/auth', () => ({
  exchangeSession: exchangeSessionMock,
  getSession: getSessionMock,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe('SessionBootstrap', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    sessionState.session = null;
    sessionState.isLoading = false;
    exchangeSessionMock.mockReset();
    getSessionMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    globalThis.history.replaceState({}, '', '/ui?session=session-123');
  });

  it('deduplicates session exchange in StrictMode and stores the token', async () => {
    exchangeSessionMock.mockResolvedValue({ token: 'app-token-123' });
    getSessionMock.mockResolvedValue({
      authenticated: true,
      user: { subject: 'sub-1', email: 'user@example.com' },
      oidc: {
        issuer: 'https://issuer.example.com',
        subject: 'sub-1',
        audience: ['ui'],
        email: 'user@example.com',
        claims: {},
      },
      n8nUser: {
        id: 'user-1',
        email: 'user@example.com',
        disabled: false,
        role: null,
      },
      permissions: {
        isAdmin: false,
        canRequestAccess: true,
        canReviewAccessRequests: false,
        canShareWorkflows: false,
        canUnshareWorkflows: false,
      },
    });

    render(
      <StrictMode>
        <QueryClientProvider client={createQueryClient()}>
          <SessionBootstrap>
            <div>child</div>
          </SessionBootstrap>
        </QueryClientProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(exchangeSessionMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(globalThis.localStorage.getItem(APP_AUTH_TOKEN_STORAGE_KEY)).toBe('app-token-123');
    });

    expect(new URL(globalThis.location.href).searchParams.get('session')).toBeNull();
  });

  it('clears the browser token after coordinated logout', async () => {
    globalThis.localStorage.setItem(APP_AUTH_TOKEN_STORAGE_KEY, 'stale-token');
    globalThis.history.replaceState({}, '', '/ui?signedOut=1');

    render(
      <QueryClientProvider client={createQueryClient()}>
        <SessionBootstrap>
          <div>child</div>
        </SessionBootstrap>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(globalThis.localStorage.getItem(APP_AUTH_TOKEN_STORAGE_KEY)).toBeNull();
    });
    expect(new URL(globalThis.location.href).searchParams.get('signedOut')).toBeNull();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('removes session, continue, signedOut and logout markers while preserving unrelated query and hash', async () => {
    exchangeSessionMock.mockResolvedValue({ token: 'tok-abc' });
    getSessionMock.mockResolvedValue({
      authenticated: true,
      user: { subject: 'sub-1', email: 'a@example.com' },
      oidc: { issuer: 'https://issuer', subject: 'sub-1', audience: ['ui'], email: 'a@example.com', claims: {} },
      n8nUser: { id: '1', email: 'a@example.com', disabled: false, role: null },
      permissions: {
        isAdmin: false,
        canRequestAccess: true,
        canReviewAccessRequests: false,
        canShareWorkflows: false,
        canUnshareWorkflows: false,
      },
    } as any);
    globalThis.history.replaceState(
      {},
      '',
      '/ui?session=sess-123&continue=%2Fui%2Fprojects%3Fx%3D1&signedOut=1&logout=handle-xyz&keep=yes&foo=bar#section',
    );

    render(
      <QueryClientProvider client={createQueryClient()}>
        <SessionBootstrap>
          <div>child</div>
        </SessionBootstrap>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(globalThis.localStorage.getItem(APP_AUTH_TOKEN_STORAGE_KEY)).toBe('tok-abc');
    });
    const url = new URL(globalThis.location.href);
    // Security params must be gone
    expect(url.searchParams.get('session')).toBeNull();
    expect(url.searchParams.get('continue')).toBeNull();
    expect(url.searchParams.get('signedOut')).toBeNull();
    expect(url.searchParams.get('logout')).toBeNull();
    // Unrelated params and hash preserved
    expect(url.searchParams.get('keep')).toBe('yes');
    expect(url.searchParams.get('foo')).toBe('bar');
    expect(url.hash).toBe('#section');
  });

  it('cleans up URL and token even when exchange fails, and never navigates to continue', async () => {
    exchangeSessionMock.mockRejectedValue(new Error('exchange failed'));
    globalThis.localStorage.setItem(APP_AUTH_TOKEN_STORAGE_KEY, 'stale');
    const replaceSpy = vi.fn();
    const origin = globalThis.location.origin;
    const initialUrl = new URL('/ui?session=bad&continue=%2Fui%2Fprojects&keep=1#h', origin).toString();
    const locationStub: any = {
      href: initialUrl,
      origin,
      pathname: new URL(initialUrl).pathname,
      search: new URL(initialUrl).search,
      hash: new URL(initialUrl).hash,
      replace: replaceSpy,
      assign: vi.fn(),
    };
    vi.stubGlobal('location', locationStub);
    vi.spyOn(globalThis.history, 'replaceState').mockImplementation((...args: any[]) => {
      const urlStr = args[2] as string;
      const parsed = new URL(urlStr, origin);
      locationStub.href = parsed.toString();
      locationStub.pathname = parsed.pathname;
      locationStub.search = parsed.search;
      locationStub.hash = parsed.hash;
    });

    render(
      <QueryClientProvider client={createQueryClient()}>
        <SessionBootstrap>
          <div>child</div>
        </SessionBootstrap>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(globalThis.localStorage.getItem(APP_AUTH_TOKEN_STORAGE_KEY)).toBeNull();
    });
    expect(replaceSpy).not.toHaveBeenCalled();
    const url = new URL(locationStub.href);
    expect(url.searchParams.get('session')).toBeNull();
    expect(url.searchParams.get('continue')).toBeNull();
    expect(url.searchParams.get('keep')).toBe('1');
    expect(url.hash).toBe('#h');
  });

  it('valid continuation occurs only after successful exchange and navigates to local target', async () => {
    exchangeSessionMock.mockResolvedValue({ token: 'tok-2' });
    getSessionMock.mockResolvedValue({
      authenticated: true,
      user: { subject: 'sub-1', email: 'a@example.com' },
      oidc: { issuer: 'https://issuer', subject: 'sub-1', audience: ['ui'], email: 'a@example.com', claims: {} },
      n8nUser: { id: '1', email: 'a@example.com', disabled: false, role: null },
      permissions: {
        isAdmin: false,
        canRequestAccess: true,
        canReviewAccessRequests: false,
        canShareWorkflows: false,
        canUnshareWorkflows: false,
      },
    } as any);
    const replaceSpy = vi.fn();
    const origin = globalThis.location.origin;
    const initialUrl = new URL(
      '/ui?session=handle-1&continue=%2Fui%2Fprojects%3Ffilter%3Dactive%23top',
      origin,
    ).toString();
    const locationStub: any = {
      href: initialUrl,
      origin,
      pathname: new URL(initialUrl).pathname,
      search: new URL(initialUrl).search,
      hash: new URL(initialUrl).hash,
      replace: replaceSpy,
      assign: vi.fn(),
    };
    vi.stubGlobal('location', locationStub);
    vi.spyOn(globalThis.history, 'replaceState').mockImplementation((...args: any[]) => {
      const urlStr = args[2] as string;
      const parsed = new URL(urlStr, origin);
      locationStub.href = parsed.toString();
      locationStub.pathname = parsed.pathname;
      locationStub.search = parsed.search;
      locationStub.hash = parsed.hash;
    });

    render(
      <QueryClientProvider client={createQueryClient()}>
        <SessionBootstrap>
          <div>child</div>
        </SessionBootstrap>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(exchangeSessionMock).toHaveBeenCalledWith('handle-1');
    });
    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith('/ui/projects?filter=active#top');
    });
  });

  it('does not navigate to rejected continuation target and cleans it', async () => {
    exchangeSessionMock.mockResolvedValue({ token: 'tok-3' });
    getSessionMock.mockResolvedValue({
      authenticated: true,
      user: { subject: 'sub-1', email: 'a@example.com' },
      oidc: { issuer: 'https://issuer', subject: 'sub-1', audience: ['ui'], email: 'a@example.com', claims: {} },
      n8nUser: { id: '1', email: 'a@example.com', disabled: false, role: null },
      permissions: {
        isAdmin: false,
        canRequestAccess: true,
        canReviewAccessRequests: false,
        canShareWorkflows: false,
        canUnshareWorkflows: false,
      },
    } as any);
    const replaceSpy = vi.fn();
    const origin = globalThis.location.origin;
    const initialUrl = new URL('/ui?session=handle-2&continue=https%3A%2F%2Fevil.test%2Fphish', origin).toString();
    const locationStub: any = {
      href: initialUrl,
      origin,
      pathname: new URL(initialUrl).pathname,
      search: new URL(initialUrl).search,
      hash: new URL(initialUrl).hash,
      replace: replaceSpy,
      assign: vi.fn(),
    };
    vi.stubGlobal('location', locationStub);
    vi.spyOn(globalThis.history, 'replaceState').mockImplementation((...args: any[]) => {
      const urlStr = args[2] as string;
      const parsed = new URL(urlStr, origin);
      locationStub.href = parsed.toString();
      locationStub.pathname = parsed.pathname;
      locationStub.search = parsed.search;
      locationStub.hash = parsed.hash;
    });

    render(
      <QueryClientProvider client={createQueryClient()}>
        <SessionBootstrap>
          <div>child</div>
        </SessionBootstrap>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(globalThis.localStorage.getItem(APP_AUTH_TOKEN_STORAGE_KEY)).toBe('tok-3');
    });
    expect(replaceSpy).not.toHaveBeenCalled();
    const url = new URL(locationStub.href);
    expect(url.searchParams.get('continue')).toBeNull();
    expect(url.searchParams.get('session')).toBeNull();
  });

  it('clears logout and continue markers even without a session handle', async () => {
    globalThis.history.replaceState({}, '', '/ui?continue=%2Fui%2Fprojects&logout=handle-123&keep=1#hash');
    render(
      <QueryClientProvider client={createQueryClient()}>
        <SessionBootstrap>
          <div>child</div>
        </SessionBootstrap>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const url = new URL(globalThis.location.href);
      expect(url.searchParams.get('continue')).toBeNull();
      expect(url.searchParams.get('logout')).toBeNull();
      expect(url.searchParams.get('keep')).toBe('1');
      expect(url.hash).toBe('#hash');
    });
    expect(exchangeSessionMock).not.toHaveBeenCalled();
  });
});

describe('resolveContinuationUrl', () => {
  const origin = 'https://ui.example.com';

  it.each([
    ['missing value', null],
    ['authority-relative path', '//evil.test'],
    ['backslash network path', '/\\evil.test/path'],
    ['foreign origin', 'https://evil.test/ui'],
    ['same-origin absolute URL', 'https://ui.example.com/ui/settings'],
    ['non-http scheme', 'javascript:alert(1)'],
    ['unparseable URL', 'https://'],
  ])('rejects a %s', (_label, value) => {
    expect(resolveContinuationUrl(value, origin)).toBeNull();
  });

  it.each([
    ['local path', '/ui/projects', '/ui/projects'],
    ['local path with query and fragment', '/ui/projects?filter=active#top', '/ui/projects?filter=active#top'],
  ])('allows a %s', (_label, value, expected) => {
    expect(resolveContinuationUrl(value, origin)).toBe(expected);
  });
});
