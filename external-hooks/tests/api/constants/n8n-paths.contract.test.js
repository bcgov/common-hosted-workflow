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
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const n8nPaths = __importStar(require("../../../src/api/constants/n8n-paths"));
const n8n_paths_1 = require("../../../src/api/constants/n8n-paths");
const n8n_internals_check_1 = require("../../../src/api/helpers/n8n-internals-check");
/**
 * These tests do NOT touch the real n8n runtime (its absolute paths only resolve inside the
 * n8n container). They guarantee the manifest the startup guard walks stays complete, and that
 * the guard's checking logic reports missing modules/exports correctly. The guard that actually
 * fails on an unsupported n8n version is `src/verify-n8n-internals.ts`, run inside the image.
 */
/** Every exported `N8N_*_PATH` string constant — the modules the code may `require()` at runtime. */
function allN8nPathConstants() {
    return Object.entries(n8nPaths)
        .filter(([name, value]) => /^N8N_.*_PATH$/.test(name) && typeof value === 'string')
        .map(([, value]) => value);
}
(0, vitest_1.describe)('N8N_INTERNAL_MODULES manifest', () => {
    (0, vitest_1.it)('covers every N8N_*_PATH constant so no required module escapes the startup guard', () => {
        const manifestPaths = new Set(Object.keys(n8n_paths_1.N8N_INTERNAL_MODULES));
        const uncovered = allN8nPathConstants().filter((path) => !manifestPaths.has(path));
        (0, vitest_1.expect)(uncovered, `add these paths to N8N_INTERNAL_MODULES: ${uncovered.join(', ')}`).toEqual([]);
    });
    (0, vitest_1.it)('lists at least one expected export for every module', () => {
        for (const [path, exports] of Object.entries(n8n_paths_1.N8N_INTERNAL_MODULES)) {
            (0, vitest_1.expect)(exports.length, `${path} must declare the exports it depends on`).toBeGreaterThan(0);
        }
    });
});
(0, vitest_1.describe)('verifyN8nInternals', () => {
    const manifest = {
        '/fake/module-a': ['Alpha', 'Beta'],
        '/fake/module-b': ['Gamma'],
    };
    (0, vitest_1.it)('passes when every module resolves with all expected exports', () => {
        const load = (path) => (path === '/fake/module-a' ? { Alpha: class {
            }, Beta: () => { } } : { Gamma: 1 });
        const result = (0, n8n_internals_check_1.verifyN8nInternals)(load, manifest);
        (0, vitest_1.expect)(result.ok).toBe(true);
        (0, vitest_1.expect)(result.results.every((r) => r.ok)).toBe(true);
    });
    (0, vitest_1.it)('fails with module-missing when a require throws (module renamed/moved on upgrade)', () => {
        const load = (path) => {
            if (path === '/fake/module-b')
                throw new Error("Cannot find module '/fake/module-b'");
            return { Alpha: {}, Beta: {} };
        };
        const result = (0, n8n_internals_check_1.verifyN8nInternals)(load, manifest);
        (0, vitest_1.expect)(result.ok).toBe(false);
        const moduleB = result.results.find((r) => r.path === '/fake/module-b');
        (0, vitest_1.expect)(moduleB).toMatchObject({ ok: false, reason: 'module-missing' });
    });
    (0, vitest_1.it)('fails with exports-missing when a module loses an expected export', () => {
        const load = (path) => (path === '/fake/module-a' ? { Alpha: {} } : { Gamma: {} });
        const result = (0, n8n_internals_check_1.verifyN8nInternals)(load, manifest);
        (0, vitest_1.expect)(result.ok).toBe(false);
        const moduleA = result.results.find((r) => r.path === '/fake/module-a');
        (0, vitest_1.expect)(moduleA).toMatchObject({ ok: false, reason: 'exports-missing', missingExports: ['Beta'] });
    });
    (0, vitest_1.it)('treats a null/undefined module export as missing', () => {
        const load = () => null;
        const result = (0, n8n_internals_check_1.verifyN8nInternals)(load, { '/fake/module-a': ['Alpha'] });
        (0, vitest_1.expect)(result.ok).toBe(false);
        (0, vitest_1.expect)(result.results[0]).toMatchObject({ ok: false, reason: 'exports-missing', missingExports: ['Alpha'] });
    });
});
