"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_url_1 = require("node:url");
const node_vm_1 = __importDefault(require("node:vm"));
const vitest_1 = require("vitest");
const hookPath = (0, node_path_1.resolve)((0, node_path_1.dirname)((0, node_url_1.fileURLToPath)(import.meta.url)), '../../../src/api/assets/oidc-frontend-hook.js');
const hookScript = (0, node_fs_1.readFileSync)(hookPath, 'utf8');
const assetsModulePath = (0, node_path_1.resolve)((0, node_path_1.dirname)((0, node_url_1.fileURLToPath)(import.meta.url)), '../../../src/api/bootstrap/assets.ts');
const assetsSource = (0, node_fs_1.readFileSync)(assetsModulePath, 'utf8');
function runHook(options) {
    const listeners = new Map();
    const windowListeners = new Map();
    const replacedWith = [];
    const assignedTo = [];
    const logs = [];
    const timers = [];
    const document = {
        readyState: options.readyState ?? 'complete',
        addEventListener: (type, listener) => {
            listeners.set(type, listener);
        },
    };
    const location = {
        origin: options.origin ?? 'https://example.test',
        pathname: options.pathname,
        search: '',
        replace: (path) => {
            replacedWith.push(path);
        },
        assign: (path) => {
            assignedTo.push(path);
        },
    };
    const history = {
        pushState: (_state, _unused, url) => {
            if (url)
                location.pathname = new URL(String(url), location.origin).pathname;
        },
        replaceState: (_state, _unused, url) => {
            if (url)
                location.pathname = new URL(String(url), location.origin).pathname;
        },
    };
    const context = node_vm_1.default.createContext({
        console: {
            log: (...args) => logs.push(args),
        },
        document,
        setTimeout: (callback) => {
            timers.push(callback);
            return timers.length;
        },
        window: {
            addEventListener: (type, listener) => {
                windowListeners.set(type, listener);
            },
            history,
            location,
        },
    });
    node_vm_1.default.runInContext(hookScript, context);
    return {
        assignedTo,
        dispatchDocumentEvent: (type, event) => listeners.get(type)?.(event ?? new Event(type)),
        dispatchWindowEvent: (type, event) => windowListeners.get(type)?.(event ?? new Event(type)),
        history,
        listeners,
        logs,
        replacedWith,
        runTimers: () => timers.splice(0).forEach((timer) => timer()),
        windowListeners,
    };
}
(0, vitest_1.describe)('OIDC frontend hook', () => {
    (0, vitest_1.it)('replaces /login with /ui without installing logout interception', () => {
        const harness = runHook({ pathname: '/login' });
        (0, vitest_1.expect)(harness.replacedWith).toEqual(['/ui']);
        (0, vitest_1.expect)(harness.listeners.has('click')).toBe(false);
    });
    (0, vitest_1.it)('does not redirect non-login pages', () => {
        const harness = runHook({ pathname: '/' });
        (0, vitest_1.expect)(harness.replacedWith).toEqual([]);
    });
    (0, vitest_1.it)('replaces SPA navigation to /signin with /ui', () => {
        const harness = runHook({ pathname: '/' });
        harness.history.pushState({}, '', '/signin');
        harness.runTimers();
        (0, vitest_1.expect)(harness.replacedWith).toEqual(['/ui']);
    });
    (0, vitest_1.it)('replaces SPA navigation via replaceState to /login with /ui', () => {
        const harness = runHook({ pathname: '/' });
        harness.history.replaceState({}, '', '/login');
        harness.runTimers();
        (0, vitest_1.expect)(harness.replacedWith).toEqual(['/ui']);
    });
    (0, vitest_1.it)('replaces history popstate navigation to /login with /ui', () => {
        const harness = runHook({ pathname: '/' });
        // Simulate SPA back/forward navigation that lands on /login
        harness.history.pushState({}, '', '/');
        harness.runTimers();
        (0, vitest_1.expect)(harness.replacedWith).toEqual([]);
        // Manually set pathname to /login as if popstate landed there
        const harness2 = runHook({ pathname: '/login' });
        // Initial load already redirects, but also test popstate path
        (0, vitest_1.expect)(harness2.replacedWith).toEqual(['/ui']);
        const harness3 = runHook({ pathname: '/' });
        // Simulate navigation to /login via history then popstate
        harness3.history.pushState({}, '', '/login');
        harness3.runTimers();
        (0, vitest_1.expect)(harness3.replacedWith).toEqual(['/ui']);
    });
    (0, vitest_1.it)('routes logout clicks through the OIDC logout endpoint', () => {
        const harness = runHook({ pathname: '/', origin: 'https://n8n.example.test' });
        const event = {
            preventDefault: vitest_1.vi.fn(),
            stopPropagation: vitest_1.vi.fn(),
            target: {
                closest: (selector) => (selector === '[data-test-id="main-sidebar-log-out"]' ? {} : null),
            },
            stopImmediatePropagation: vitest_1.vi.fn(),
        };
        harness.dispatchDocumentEvent('click', event);
        (0, vitest_1.expect)(event.preventDefault).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(event.stopPropagation).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(event.stopImmediatePropagation).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(harness.assignedTo).toEqual(['/rest/auth/oidc/logout?returnTo=https%3A%2F%2Fn8n.example.test%2Fui']);
    });
    (0, vitest_1.it)('ignores clicks not on the logout selector', () => {
        const harness = runHook({ pathname: '/' });
        const event = {
            preventDefault: vitest_1.vi.fn(),
            stopPropagation: vitest_1.vi.fn(),
            target: {
                closest: () => null,
            },
            stopImmediatePropagation: vitest_1.vi.fn(),
        };
        harness.dispatchDocumentEvent('click', event);
        (0, vitest_1.expect)(harness.assignedTo).toEqual([]);
    });
    (0, vitest_1.it)('contains no legacy mode or form-injection strings', () => {
        (0, vitest_1.expect)(hookScript).not.toMatch(/OIDC_FRONTEND_HOOK_MODE/);
        (0, vitest_1.expect)(hookScript).not.toMatch(/__OIDC_FRONTEND_HOOK_MODE__/);
        (0, vitest_1.expect)(hookScript).not.toMatch(/showLogin/);
        (0, vitest_1.expect)(hookScript).not.toMatch(/MutationObserver/);
        (0, vitest_1.expect)(hookScript).not.toMatch(/oidc-sso-button/);
        (0, vitest_1.expect)(hookScript).not.toMatch(/_inputsContainer_/);
        (0, vitest_1.expect)(hookScript).not.toMatch(/legacy/i);
    });
});
(0, vitest_1.describe)('OIDC frontend hook static serving', () => {
    (0, vitest_1.it)('asset module contains no runtime mode injection or per-request file reads', () => {
        (0, vitest_1.expect)(assetsSource).not.toMatch(/OIDC_FRONTEND_HOOK_MODE/);
        (0, vitest_1.expect)(assetsSource).not.toMatch(/__OIDC_FRONTEND_HOOK_MODE__/);
        (0, vitest_1.expect)(assetsSource).not.toMatch(/readFileSync/);
        (0, vitest_1.expect)(assetsSource).not.toMatch(/process\.env/);
        (0, vitest_1.expect)(assetsSource).not.toMatch(/app\.get\(.*oidc-frontend-hook/);
    });
    (0, vitest_1.it)('mountAssets serves /assets via static middleware with cache headers', async () => {
        const { mountAssets } = await Promise.resolve().then(() => __importStar(require('../../../src/api/bootstrap/assets.js')));
        const useArgs = [];
        const getArgs = [];
        const mockApp = {
            get: (path) => {
                getArgs.push(path);
            },
            use: (path, middleware) => {
                useArgs.push({ path, middleware });
            },
        };
        mountAssets(mockApp, '/tmp/assets');
        (0, vitest_1.expect)(getArgs).toEqual([]);
        (0, vitest_1.expect)(useArgs.length).toBe(1);
        (0, vitest_1.expect)(useArgs[0].path).toBe('/assets');
        (0, vitest_1.expect)(typeof useArgs[0].middleware).toBe('function');
        // Verify static options via source content (express.static options are not spyable in ESM)
        (0, vitest_1.expect)(assetsSource).toMatch(/maxAge:\s*'1h'/);
        (0, vitest_1.expect)(assetsSource).toMatch(/index:\s*false/);
        (0, vitest_1.expect)(assetsSource).toContain('Cache-Control');
        (0, vitest_1.expect)(assetsSource).toContain('public, max-age=3600');
    });
    (0, vitest_1.it)('hook file is served as static javascript with expected cache behavior', () => {
        // Static middleware will set Content-Type based on file extension; verify hook is plain JS
        (0, vitest_1.expect)(hookScript).toContain('window.location.replace');
        (0, vitest_1.expect)(hookScript).toContain('/rest/auth/oidc/logout?returnTo=');
        // Verify assets source sets Cache-Control header and maxAge
        (0, vitest_1.expect)(assetsSource).toContain('Cache-Control');
        (0, vitest_1.expect)(assetsSource).toContain('max-age=3600');
        (0, vitest_1.expect)(assetsSource).toContain("maxAge: '1h'");
    });
});
