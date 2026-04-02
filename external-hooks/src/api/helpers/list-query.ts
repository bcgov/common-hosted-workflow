import { z } from 'zod';
import type { ListPaginationSince } from '../../types/list-pagination';
import { listPaginationCursorUuidRegex } from '../constants/regex';

/**
 * Shared schemas for list-style HTTP query params (`since`, `limit`) across CHWF APIs
 * (e.g. messages, actions).
 */

/**
 * Optional `since` query:
 * - Plain ISO datetime → filter rows with `createdAt >= since`.
 * - `ISO8601|uuid` → keyset page after that row (use value from `nextCursor`).
 */
export const optionalSinceOrCursorQueryParam = z
  .string()
  .min(1)
  .superRefine((s, ctx) => {
    const pipe = s.indexOf('|');
    if (pipe > 0) {
      const iso = s.slice(0, pipe);
      const id = s.slice(pipe + 1).trim();
      if (Number.isNaN(new Date(iso).getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'since cursor has invalid timestamp' });
      }
      if (!listPaginationCursorUuidRegex.test(id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'since cursor has invalid id' });
      }
    } else if (Number.isNaN(new Date(s).getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'since must be a valid ISO date string' });
    }
  })
  .transform((s): ListPaginationSince => {
    const pipe = s.indexOf('|');
    if (pipe > 0) {
      const iso = s.slice(0, pipe);
      const id = s.slice(pipe + 1).trim();
      return { mode: 'cursor', createdAt: new Date(iso), id };
    }
    return { mode: 'time', since: new Date(s) };
  });

/** Encode the last row of a page as `nextCursor` (pair with composite `since`). */
export function encodeListNextCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

/**
 * When `items.length === pageLimit`, there may be another page; return a keyset cursor from the last row.
 * Otherwise `null`.
 */
export function nextCursorFromPagedItems<T extends { createdAt: Date; id: string }>(
  items: T[],
  pageLimit: number,
): string | null {
  const last = items.at(-1);
  return items.length === pageLimit && last ? encodeListNextCursor(last) : null;
}

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
