import { N8N_INTERNAL_MODULES } from '../constants/n8n-paths';

/** A single module's verification outcome. */
export type ModuleCheckResult =
  | { path: string; ok: true }
  | { path: string; ok: false; reason: 'module-missing'; error: string }
  | { path: string; ok: false; reason: 'exports-missing'; missingExports: string[] };

export type VerifyResult = {
  ok: boolean;
  results: ModuleCheckResult[];
};

/** Loads a module by absolute path. Injectable so tests never touch the real n8n runtime. */
export type ModuleLoader = (path: string) => unknown;

/**
 * Checks every module in `manifest` against `load`: the module must resolve and expose each
 * expected named export (a non-`undefined` own/inherited property). Pure and loader-injected so
 * the real check (in `verify-n8n-internals.ts`) and its unit test share one implementation.
 */
export function verifyN8nInternals(
  load: ModuleLoader,
  manifest: Record<string, readonly string[]> = N8N_INTERNAL_MODULES,
): VerifyResult {
  const results: ModuleCheckResult[] = Object.entries(manifest).map(([path, expectedExports]) => {
    let mod: Record<string, unknown>;
    try {
      mod = load(path) as Record<string, unknown>;
    } catch (error) {
      return {
        path,
        ok: false,
        reason: 'module-missing',
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const missingExports = expectedExports.filter((name) => mod == null || mod[name] === undefined);
    return missingExports.length === 0
      ? { path, ok: true }
      : { path, ok: false, reason: 'exports-missing', missingExports };
  });

  return { ok: results.every((result) => result.ok), results };
}

/** One human-readable line per module for CLI/log output. */
export function formatCheckResult(result: ModuleCheckResult): string {
  if (result.ok) return `  ok    ${result.path}`;
  if (result.reason === 'module-missing') return `  FAIL  ${result.path} — cannot load module: ${result.error}`;
  return `  FAIL  ${result.path} — missing export(s): ${result.missingExports.join(', ')}`;
}
