'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.wilChefsTokenSchema = exports.wilCallbackSchema = exports.wilListQuerySchema = void 0;
const zod_1 = require('zod');
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;
/**
 * Shared query schema for WIL list endpoints (GET /messages, GET /actions).
 *
 * - `limit`: optional positive integer, clamped to MAX_LIMIT, defaults to DEFAULT_LIMIT.
 * - `since`: optional keyset cursor string in the format `ISO|uuid` or a plain ISO-8601 date.
 */
const VALID_ACTION_STATUSES = ['pending', 'claimed', 'in_progress', 'completed', 'cancelled', 'expired', 'deleted'];
exports.wilListQuerySchema = zod_1.z.object({
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.object({
    limit: zod_1.z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return DEFAULT_LIMIT;
        const n = Number.parseInt(val, 10);
        if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
        return Math.min(n, MAX_LIMIT);
      }),
    since: zod_1.z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        const pipeIndex = val.indexOf('|');
        if (pipeIndex === -1) {
          const date = new Date(val);
          if (Number.isNaN(date.getTime())) return undefined;
          return { mode: 'time', since: date };
        }
        const isoStr = val.substring(0, pipeIndex);
        const id = val.substring(pipeIndex + 1);
        const date = new Date(isoStr);
        if (Number.isNaN(date.getTime()) || !id) return undefined;
        return { mode: 'cursor', createdAt: date, id };
      }),
    status: zod_1.z
      .union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())])
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        const raw = Array.isArray(val) ? val : val.split(',');
        const valid = raw.filter((s) => VALID_ACTION_STATUSES.includes(s));
        return valid.length > 0 ? valid : undefined;
      }),
  }),
});
/** POST /ui-api/wil/callback */
exports.wilCallbackSchema = zod_1.z.object({
  body: zod_1.z.object({
    actionId: zod_1.z.string().min(1, 'actionId is required'),
    body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
  }),
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** POST /ui-api/wil/chefs-token */
exports.wilChefsTokenSchema = zod_1.z.object({
  body: zod_1.z.object({
    actionId: zod_1.z.string().min(1, 'actionId is required'),
  }),
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
