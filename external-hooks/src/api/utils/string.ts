import { z } from 'zod';

/** Returns a shortened ID for logs to avoid leaking full identifiers. */
export function shortenIdForLog(id: string | undefined): string {
  if (!id) return '(none)';
  const trimmedId = id.trim();
  return trimmedId.length > 8 ? `${trimmedId.slice(0, 8)}...` : trimmedId;
}

/** Returns true when value is a non-empty trimmed string. */
export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Trims a string value; returns empty string for non-strings. */
export const trimString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/**
 * Wraps a Zod enum so JSON string values are trimmed and lowercased before validation
 */
export function applyLowercaseToZodEnum<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), schema);
}

/**
 * Same as `applyLowercaseToZodEnum` for optional fields: `undefined` is passed through unchanged.
 */
export function applyLowercaseToOptionalZodEnum<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (v) => (v === undefined ? undefined : typeof v === 'string' ? v.trim().toLowerCase() : v),
    schema.optional(),
  );
}
