import { describe, expect, it } from 'vitest';
import * as n8nPaths from '../../../src/api/constants/n8n-paths';
import { N8N_INTERNAL_MODULES } from '../../../src/api/constants/n8n-paths';
import { verifyN8nInternals } from '../../../src/api/helpers/n8n-internals-check';

/**
 * These tests do NOT touch the real n8n runtime (its absolute paths only resolve inside the
 * n8n container). They guarantee the manifest the startup guard walks stays complete, and that
 * the guard's checking logic reports missing modules/exports correctly. The guard that actually
 * fails on an unsupported n8n version is `src/verify-n8n-internals.ts`, run inside the image.
 */

/** Every exported `N8N_*_PATH` string constant — the modules the code may `require()` at runtime. */
function allN8nPathConstants(): string[] {
  return Object.entries(n8nPaths)
    .filter(([name, value]) => /^N8N_.*_PATH$/.test(name) && typeof value === 'string')
    .map(([, value]) => value as string);
}

describe('N8N_INTERNAL_MODULES manifest', () => {
  it('covers every N8N_*_PATH constant so no required module escapes the startup guard', () => {
    const manifestPaths = new Set(Object.keys(N8N_INTERNAL_MODULES));
    const uncovered = allN8nPathConstants().filter((path) => !manifestPaths.has(path));
    expect(uncovered, `add these paths to N8N_INTERNAL_MODULES: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('lists at least one expected export for every module', () => {
    for (const [path, exports] of Object.entries(N8N_INTERNAL_MODULES)) {
      expect(exports.length, `${path} must declare the exports it depends on`).toBeGreaterThan(0);
    }
  });
});

describe('verifyN8nInternals', () => {
  const manifest = {
    '/fake/module-a': ['Alpha', 'Beta'],
    '/fake/module-b': ['Gamma'],
  } as const;

  it('passes when every module resolves with all expected exports', () => {
    const load = (path: string) => (path === '/fake/module-a' ? { Alpha: class {}, Beta: () => {} } : { Gamma: 1 });

    const result = verifyN8nInternals(load, manifest);

    expect(result.ok).toBe(true);
    expect(result.results.every((r) => r.ok)).toBe(true);
  });

  it('fails with module-missing when a require throws (module renamed/moved on upgrade)', () => {
    const load = (path: string) => {
      if (path === '/fake/module-b') throw new Error("Cannot find module '/fake/module-b'");
      return { Alpha: {}, Beta: {} };
    };

    const result = verifyN8nInternals(load, manifest);

    expect(result.ok).toBe(false);
    const moduleB = result.results.find((r) => r.path === '/fake/module-b');
    expect(moduleB).toMatchObject({ ok: false, reason: 'module-missing' });
  });

  it('fails with exports-missing when a module loses an expected export', () => {
    const load = (path: string) => (path === '/fake/module-a' ? { Alpha: {} } : { Gamma: {} });

    const result = verifyN8nInternals(load, manifest);

    expect(result.ok).toBe(false);
    const moduleA = result.results.find((r) => r.path === '/fake/module-a');
    expect(moduleA).toMatchObject({ ok: false, reason: 'exports-missing', missingExports: ['Beta'] });
  });

  it('treats a null/undefined module export as missing', () => {
    const load = () => null;

    const result = verifyN8nInternals(load, { '/fake/module-a': ['Alpha'] });

    expect(result.ok).toBe(false);
    expect(result.results[0]).toMatchObject({ ok: false, reason: 'exports-missing', missingExports: ['Alpha'] });
  });
});
