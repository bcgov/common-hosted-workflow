/**
 * Preprocessing helpers for Express `req.query` and `req.params` before schema validation.
 */

/**
 * Normalizes Express `req.query` values to plain strings (first element if repeated).
 * Avoids fields being dropped when the parser yields `string[]`.
 */
export function flattenQueryParams(query: unknown): Record<string, string | undefined> {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return {};
  const out: Record<string, string | undefined> = {};
  for (const [key, raw] of Object.entries(query as Record<string, unknown>)) {
    if (raw === undefined || raw === null) {
      out[key] = undefined;
      continue;
    }
    if (Array.isArray(raw)) {
      const first = raw[0];
      if (typeof first === 'string') out[key] = first;
      else if (first === undefined || first === null) out[key] = undefined;
      else out[key] = String(first);
      continue;
    }
    if (typeof raw === 'string') {
      out[key] = raw;
    }
  }
  return out;
}

/** Treats empty string / null / undefined as absent for optional query fields. */
export function emptyQueryValueToUndefined(value: unknown): unknown {
  if (value === '' || value === undefined || value === null) return undefined;
  return value;
}

/**
 * Preprocess for `req.params` before `z.object(...).strict()` — safe object for Zod.
 */
export function asParamRecord(params: unknown): Record<string, string> {
  return params && typeof params === 'object' && !Array.isArray(params) ? (params as Record<string, string>) : {};
}
