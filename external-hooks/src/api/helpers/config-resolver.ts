/**
 * Parses a JSON string of feature flags into a typed registry.
 * Only boolean values are extracted; non-boolean entries are ignored.
 * Returns an empty object for absent, empty, or invalid input.
 */
export function parseFeatureFlagConfig(raw: string): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const registry: Record<string, boolean> = {};
      for (const key of Object.keys(parsed)) {
        if (typeof parsed[key] === 'boolean') {
          registry[key] = parsed[key];
        }
      }
      return registry;
    }
    return {};
  } catch {
    return {};
  }
}
