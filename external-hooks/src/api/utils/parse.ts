/** Plain string → positive integer or null (query/path parsing). */
export const parsePositiveInteger = (value: string | undefined) => {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

/** Plain string → Date or null. */
export const parseDate = (value: string | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

/**
 * JSON body timestamp fields: `undefined` / `null` preserved; strings must parse to a valid Date.
 * Returns `undefined` for invalid non-null values (caller validates).
 */
export function parseOptionalBodyTimestamp(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
