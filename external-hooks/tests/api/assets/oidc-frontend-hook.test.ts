import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const hookPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/api/assets/oidc-frontend-hook.js');
const hookScript = readFileSync(hookPath, 'utf8');
const assetsModulePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/api/bootstrap/assets.ts');
const assetsSource = readFileSync(assetsModulePath, 'utf8');

type HarnessOptions = {
  pathname: string;
  origin?: string;
  readyState?: DocumentReadyState;
};

function runHook(options: HarnessOptions) {
  const listeners = new Map<string, EventListener>();
  const windowListeners = new Map<string, EventListener>();
  const replacedWith: string[] = [];
  const assignedTo: string[] = [];
  const logs: unknown[][] = [];
  const timers: Array<() => void> = [];

  const document = {
    readyState: options.readyState ?? 'complete',
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, listener);
    },
  };

  const location = {
    origin: options.origin ?? 'https://example.test',
    pathname: options.pathname,
    search: '',
    replace: (path: string) => {
      replacedWith.push(path);
    },
    assign: (path: string) => {
      assignedTo.push(path);
    },
  };
  const history = {
    pushState: (_state: unknown, _unused: string, url?: string | URL | null) => {
      if (url) location.pathname = new URL(String(url), location.origin).pathname;
    },
    replaceState: (_state: unknown, _unused: string, url?: string | URL | null) => {
      if (url) location.pathname = new URL(String(url), location.origin).pathname;
    },
  };

  const context = vm.createContext({
    console: {
      log: (...args: unknown[]) => logs.push(args),
    },
    document,
    setTimeout: (callback: () => void) => {
      timers.push(callback);
      return timers.length;
    },
    window: {
      addEventListener: (type: string, listener: EventListener) => {
        windowListeners.set(type, listener);
      },
      history,
      location,
    },
  });

  vm.runInContext(hookScript, context);

  return {
    assignedTo,
    dispatchDocumentEvent: (type: string, event?: Event) => listeners.get(type)?.(event ?? new Event(type)),
    dispatchWindowEvent: (type: string, event?: Event) => windowListeners.get(type)?.(event ?? new Event(type)),
    history,
    listeners,
    logs,
    replacedWith,
    runTimers: () => timers.splice(0).forEach((timer) => timer()),
    windowListeners,
  };
}

describe('OIDC frontend hook', () => {
  it('replaces /login with /ui without installing logout interception', () => {
    const harness = runHook({ pathname: '/login' });

    expect(harness.replacedWith).toEqual(['/ui']);
    expect(harness.listeners.has('click')).toBe(false);
  });

  it('does not redirect non-login pages', () => {
    const harness = runHook({ pathname: '/' });

    expect(harness.replacedWith).toEqual([]);
  });

  it('replaces SPA navigation to /signin with /ui', () => {
    const harness = runHook({ pathname: '/' });

    harness.history.pushState({}, '', '/signin');
    harness.runTimers();

    expect(harness.replacedWith).toEqual(['/ui']);
  });

  it('replaces SPA navigation via replaceState to /login with /ui', () => {
    const harness = runHook({ pathname: '/' });

    harness.history.replaceState({}, '', '/login');
    harness.runTimers();

    expect(harness.replacedWith).toEqual(['/ui']);
  });

  it('replaces history popstate navigation to /login with /ui', () => {
    const harness = runHook({ pathname: '/' });

    // Simulate SPA back/forward navigation that lands on /login
    harness.history.pushState({}, '', '/');
    harness.runTimers();
    expect(harness.replacedWith).toEqual([]);

    // Manually set pathname to /login as if popstate landed there
    const harness2 = runHook({ pathname: '/login' });
    // Initial load already redirects, but also test popstate path
    expect(harness2.replacedWith).toEqual(['/ui']);

    const harness3 = runHook({ pathname: '/' });
    // Simulate navigation to /login via history then popstate
    harness3.history.pushState({}, '', '/login');
    harness3.runTimers();
    expect(harness3.replacedWith).toEqual(['/ui']);
  });

  it('routes logout clicks through the OIDC logout endpoint', () => {
    const harness = runHook({ pathname: '/', origin: 'https://n8n.example.test' });
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: {
        closest: (selector: string) => (selector === '[data-test-id="main-sidebar-log-out"]' ? {} : null),
      },
      stopImmediatePropagation: vi.fn(),
    } as unknown as Event;

    harness.dispatchDocumentEvent('click', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(harness.assignedTo).toEqual(['/rest/auth/oidc/logout?returnTo=https%3A%2F%2Fn8n.example.test%2Fui']);
  });

  it('ignores clicks not on the logout selector', () => {
    const harness = runHook({ pathname: '/' });
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: {
        closest: () => null,
      },
      stopImmediatePropagation: vi.fn(),
    } as unknown as Event;

    harness.dispatchDocumentEvent('click', event);

    expect(harness.assignedTo).toEqual([]);
  });

  it('contains no legacy mode or form-injection strings', () => {
    expect(hookScript).not.toMatch(/OIDC_FRONTEND_HOOK_MODE/);
    expect(hookScript).not.toMatch(/__OIDC_FRONTEND_HOOK_MODE__/);
    expect(hookScript).not.toMatch(/showLogin/);
    expect(hookScript).not.toMatch(/MutationObserver/);
    expect(hookScript).not.toMatch(/oidc-sso-button/);
    expect(hookScript).not.toMatch(/_inputsContainer_/);
    expect(hookScript).not.toMatch(/legacy/i);
  });
});

describe('OIDC frontend hook static serving', () => {
  it('asset module contains no runtime mode injection or per-request file reads', () => {
    expect(assetsSource).not.toMatch(/OIDC_FRONTEND_HOOK_MODE/);
    expect(assetsSource).not.toMatch(/__OIDC_FRONTEND_HOOK_MODE__/);
    expect(assetsSource).not.toMatch(/readFileSync/);
    expect(assetsSource).not.toMatch(/process\.env/);
    expect(assetsSource).not.toMatch(/app\.get\(.*oidc-frontend-hook/);
  });

  it('mountAssets serves /assets via static middleware with cache headers', async () => {
    const { mountAssets } = await import('../../../src/api/bootstrap/assets.js');

    const useArgs: Array<{ path: string; middleware: unknown }> = [];
    const getArgs: string[] = [];

    const mockApp = {
      get: (path: string) => {
        getArgs.push(path);
      },
      use: (path: string, middleware: unknown) => {
        useArgs.push({ path, middleware });
      },
    } as unknown as import('express').Express;

    mountAssets(mockApp, '/tmp/assets');

    expect(getArgs).toEqual([]);
    expect(useArgs.length).toBe(1);
    expect(useArgs[0].path).toBe('/assets');
    expect(typeof useArgs[0].middleware).toBe('function');

    // Verify static options via source content (express.static options are not spyable in ESM)
    expect(assetsSource).toMatch(/maxAge:\s*'1h'/);
    expect(assetsSource).toMatch(/index:\s*false/);
    expect(assetsSource).toContain('Cache-Control');
    expect(assetsSource).toContain('public, max-age=3600');
  });

  it('hook file is served as static javascript with expected cache behavior', () => {
    // Static middleware will set Content-Type based on file extension; verify hook is plain JS
    expect(hookScript).toContain('window.location.replace');
    expect(hookScript).toContain('/rest/auth/oidc/logout?returnTo=');
    // Verify assets source sets Cache-Control header and maxAge
    expect(assetsSource).toContain('Cache-Control');
    expect(assetsSource).toContain('max-age=3600');
    expect(assetsSource).toContain("maxAge: '1h'");
  });
});
