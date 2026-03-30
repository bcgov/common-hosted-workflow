import { z } from 'zod';

/**
 * Shared schemas for list-style HTTP query params (`since`, `limit`) across CHWF APIs
 * (e.g. messages, actions).
 */

/** Optional `since` query: ISO / Date-parseable string → `Date` for `createdAt >= since`. */
export const optionalSinceQueryParam = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(new Date(s).getTime()), {
    message: 'since must be a valid ISO date string',
  })
  .transform((s) => new Date(s));

type LimitQueryOptions = {
  min?: number;
  max?: number;
};

/**
 * Numeric page-size style query string (digits only), bounded.
 * Defaults: min 1, max 200 (typical list default).
 */
export function createLimitQueryString(options: LimitQueryOptions = {}) {
  const min = options.min ?? 1;
  const max = options.max ?? 200;
  return z
    .string()
    .regex(/^\d+$/, 'must be an integer')
    .transform(Number)
    .refine((v) => Number.isInteger(v) && v >= min && v <= max, {
      message: `must be between ${min} and ${max}`,
    });
}

/** Default list `limit` query schema (1–200). */
export const limitQueryString = createLimitQueryString();
