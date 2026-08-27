import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const hookPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/api/assets/oidc-frontend-hook.js');
const hookScript = readFileSync(hookPath, 'utf8');

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
  const createdElements: string[] = [];
  const querySelectors: string[] = [];
  const logs: unknown[][] = [];
  const timers: Array<() => void> = [];

  const document = {
    readyState: options.readyState ?? 'complete',
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, listener);
    },
    createElement: (tagName: string) => {
      createdElements.push(tagName);
      return {};
    },
    querySelector: (selector: string) => {
      querySelectors.push(selector);
      return null;
    },
  };

  const location = {
    origin: options.origin ?? 'https://example.test',
    pathname: options.pathname,
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
    createdElements,
    dispatchDocumentEvent: (type: string, event?: Event) => listeners.get(type)?.(event ?? new Event(type)),
    dispatchWindowEvent: (type: string, event?: Event) => windowListeners.get(type)?.(event ?? new Event(type)),
    history,
    listeners,
    logs,
    querySelectors,
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
    expect(harness.createdElements).toEqual([]);
    expect(harness.querySelectors).toEqual([]);
  });

  it('does not redirect non-login pages or inject an SSO button', () => {
    const harness = runHook({ pathname: '/' });

    expect(harness.replacedWith).toEqual([]);
    expect(harness.createdElements).toEqual([]);
    expect(harness.querySelectors).toEqual([]);
  });

  it('replaces SPA navigation to /signin with /ui', () => {
    const harness = runHook({ pathname: '/' });

    harness.history.pushState({}, '', '/signin');
    harness.runTimers();

    expect(harness.replacedWith).toEqual(['/ui']);
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
});
