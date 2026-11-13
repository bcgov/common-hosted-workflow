'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.limitQueryString = exports.optionalSinceOrCursorQueryParam = void 0;
exports.encodeListNextCursor = encodeListNextCursor;
exports.paginateOverfetchedRows = paginateOverfetchedRows;
exports.nextCursorFromPagedItems = nextCursorFromPagedItems;
exports.createLimitQueryString = createLimitQueryString;
const zod_1 = require('zod');
const regex_1 = require('../constants/regex');
/**
 * Shared schemas for list-style HTTP query params (`since`, `limit`) across CHWF APIs
 * (e.g. messages, actions).
 */
/**
 * Optional `since` query:
 * - Plain ISO datetime → filter rows with `createdAt >= since`.
 * - `ISO8601|uuid` → keyset page after that row (use value from `nextCursor`).
 */
exports.optionalSinceOrCursorQueryParam = zod_1.z
  .string()
  .min(1)
  .superRefine((s, ctx) => {
    const pipe = s.indexOf('|');
    if (pipe > 0) {
      const iso = s.slice(0, pipe);
      const id = s.slice(pipe + 1).trim();
      if (Number.isNaN(new Date(iso).getTime())) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'since cursor has invalid timestamp' });
      }
      if (!regex_1.listPaginationCursorUuidRegex.test(id)) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'since cursor has invalid id' });
      }
    } else if (Number.isNaN(new Date(s).getTime())) {
      ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'since must be a valid ISO date string' });
    }
  })
  .transform((s) => {
    const pipe = s.indexOf('|');
    if (pipe > 0) {
      const iso = s.slice(0, pipe);
      const id = s.slice(pipe + 1).trim();
      return { mode: 'cursor', createdAt: new Date(iso), id };
    }
    return { mode: 'time', since: new Date(s) };
  });
/** Encode the last row of a page as `nextCursor` (pair with composite `since`). */
function encodeListNextCursor(row) {
  return `${row.createdAt.toISOString()}|${row.id}`;
}
/**
 * Trims rows fetched with an "overfetch by one" query (`limit + 1`) back down to `limit`,
 * and reports whether another page actually exists.
 *
 * Repositories backing keyset-paginated lists (e.g. `ActionRequestRepository.list`,
 * `MessageRepository.list`) fetch `limit + 1` rows so callers can answer "is there a next
 * page?" directly instead of guessing from `rows.length === limit` — that guess is wrong
 * whenever the result set happens to end exactly on a page boundary, which produces a
 * `nextCursor` pointing past the last row and an empty "Load More" response.
 */
function paginateOverfetchedRows(rows, limit) {
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}
/** Returns a keyset cursor from the last row when `hasMore` is true, otherwise `null`. */
function nextCursorFromPagedItems(items, hasMore) {
  const last = items.at(-1);
  return hasMore && last ? encodeListNextCursor(last) : null;
}
/**
 * Numeric page-size style query string (digits only), bounded.
 * Defaults: min 1, max 200 (typical list default).
 */
function createLimitQueryString(options = {}) {
  const min = options.min ?? 1;
  const max = options.max ?? 200;
  return zod_1.z
    .string()
    .regex(/^\d+$/, 'must be an integer')
    .transform(Number)
    .refine((v) => Number.isInteger(v) && v >= min && v <= max, {
      message: `must be between ${min} and ${max}`,
    });
}
/** Default list `limit` query schema (1–200). */
exports.limitQueryString = createLimitQueryString();
