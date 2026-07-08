import { z } from 'zod';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

/**
 * Shared query schema for WIL list endpoints (GET /messages, GET /actions).
 *
 * - `limit`: optional positive integer, clamped to MAX_LIMIT, defaults to DEFAULT_LIMIT.
 * - `since`: optional keyset cursor string in the format `ISO|uuid` or a plain ISO-8601 date.
 */
const VALID_ACTION_STATUSES = [
  'pending',
  'claimed',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
  'deleted',
] as const;

export const wilListQuerySchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  query: z.object({
    limit: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return DEFAULT_LIMIT;
        const n = Number.parseInt(val, 10);
        if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
        return Math.min(n, MAX_LIMIT);
      }),
    since: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        const pipeIndex = val.indexOf('|');
        if (pipeIndex === -1) {
          const date = new Date(val);
          if (Number.isNaN(date.getTime())) return undefined;
          return { mode: 'time' as const, since: date };
        }
        const isoStr = val.substring(0, pipeIndex);
        const id = val.substring(pipeIndex + 1);
        const date = new Date(isoStr);
        if (Number.isNaN(date.getTime()) || !id) return undefined;
        return { mode: 'cursor' as const, createdAt: date, id };
      }),
    status: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        const raw = Array.isArray(val) ? val : val.split(',');
        const valid = raw.filter((s): s is (typeof VALID_ACTION_STATUSES)[number] =>
          (VALID_ACTION_STATUSES as readonly string[]).includes(s),
        );
        return valid.length > 0 ? valid : undefined;
      }),
  }),
});

export type WilListQuery = z.infer<typeof wilListQuerySchema>;

/** POST /ui-api/wil/callback */
export const wilCallbackSchema = z.object({
  body: z.object({
    actionId: z.string().min(1, 'actionId is required'),
    body: z.record(z.string(), z.unknown()),
  }),
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** POST /ui-api/wil/chefs-token */
export const wilChefsTokenSchema = z.object({
  body: z.object({
    actionId: z.string().min(1, 'actionId is required'),
  }),
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});
