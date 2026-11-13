"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyN8nInternals = verifyN8nInternals;
exports.formatCheckResult = formatCheckResult;
const n8n_paths_1 = require("../constants/n8n-paths");
/**
 * Checks every module in `manifest` against `load`: the module must resolve and expose each
 * expected named export (a non-`undefined` own/inherited property). Pure and loader-injected so
 * the real check (in `verify-n8n-internals.ts`) and its unit test share one implementation.
 */
function verifyN8nInternals(load, manifest = n8n_paths_1.N8N_INTERNAL_MODULES) {
    const results = Object.entries(manifest).map(([path, expectedExports]) => {
        let mod;
        try {
            mod = load(path);
        }
        catch (error) {
            return {
                path,
                ok: false,
                reason: 'module-missing',
                error: error instanceof Error ? error.message : String(error),
            };
        }
        const missingExports = expectedExports.filter((name) => mod?.[name] === undefined);
        return missingExports.length === 0
            ? { path, ok: true }
            : { path, ok: false, reason: 'exports-missing', missingExports };
    });
    return { ok: results.every((result) => result.ok), results };
}
/** One human-readable line per module for CLI/log output. */
function formatCheckResult(result) {
    if (result.ok)
        return `  ok    ${result.path}`;
    if (result.reason === 'module-missing')
        return `  FAIL  ${result.path} — cannot load module: ${result.error}`;
    return `  FAIL  ${result.path} — missing export(s): ${result.missingExports.join(', ')}`;
}
