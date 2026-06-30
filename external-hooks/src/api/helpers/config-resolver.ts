/**
 * Parses a comma-separated list of enabled feature flag names into a typed registry.
 * Each entry in the list is treated as an enabled flag (value = true).
 * Flags not present in the list are implicitly disabled.
 * Returns an empty object for absent or empty input.
 *
 * Example: "wil,project" → { wil: true, project: true }
 */
export function parseFeatureFlagConfig(raw: string): Record<string, boolean> {
  if (!raw.trim()) return {};
  const registry: Record<string, boolean> = {};
  for (const entry of raw.split(',')) {
    const flag = entry.trim();
    if (flag) {
      registry[flag] = true;
    }
  }
  return registry;
}
