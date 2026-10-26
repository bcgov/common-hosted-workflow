/**
 * Startup guard for n8n's compiled internals.
 *
 * external-hooks has no npm dependency on n8n: it `require()`s a fixed set of modules from the
 * n8n container's `node_modules`/`dist` at runtime (see `N8N_INTERNAL_MODULES`). An n8n upgrade
 * that renames or moves any of them would otherwise silently degrade the integration — credentials
 * handling and the WIL Trigger runner flip to "unavailable" and every trigger returns 503, with no
 * build-time signal.
 *
 * This script loads each module in the manifest and asserts its expected exports still exist,
 * exiting non-zero (so provisioning fails loudly) when any is gone. It runs inside the n8n image
 * — the only place those absolute paths resolve — right before `migrate.cjs` at provision time.
 *
 * Re-verify / extend the manifest on every n8n base-image bump.
 */
import { verifyN8nInternals, formatCheckResult } from './api/helpers/n8n-internals-check';

function main(): void {
  const { ok, results } = verifyN8nInternals((path) => require(path));

  console.log('Verifying n8n runtime internals:');
  for (const result of results) console.log(formatCheckResult(result));

  if (!ok) {
    const failed = results.filter((result) => !result.ok).map((result) => result.path);
    console.error(
      `\nn8n internals check FAILED for ${failed.length} module(s). This build is incompatible with the ` +
        `installed n8n version. Update src/api/constants/n8n-paths.ts (N8N_INTERNAL_MODULES) to match n8n, ` +
        `then re-verify the credentials and WIL Trigger runner integration.`,
    );
    process.exit(1);
  }

  console.log('\nAll n8n runtime internals resolved.');
}

main();
