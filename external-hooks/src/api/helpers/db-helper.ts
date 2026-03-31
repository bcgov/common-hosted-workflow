import { parseOptionalBodyTimestamp } from '../utils/parse';

type PgishError = Error & {
  code?: string;
  detail?: string;
  constraint?: string;
  column?: string;
  table?: string;
  cause?: unknown;
};

/** Walks Error.cause chains (Drizzle → driver) so CHECK/FK violations show `code` / `constraint` / `detail`. */
export function formatDbErrorForLog(error: unknown): string {
  const segments: string[] = [];
  let e: unknown = error;
  for (let depth = 0; e && depth < 8; depth++) {
    if (!(e instanceof Error)) break;
    const x = e as PgishError;
    const bit = [
      x.message,
      x.code && `code=${x.code}`,
      x.constraint && `constraint=${x.constraint}`,
      x.detail && `detail=${x.detail}`,
    ]
      .filter(Boolean)
      .join(' ');
    if (bit) segments.push(bit);
    e = x.cause;
  }
  return segments.join(' || ');
}

/** Converts validated create-body `dueDate` / `checkIn` strings into DB `timestamp` columns (null when absent). */
function optionalBodyTimestampToDb(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  const d = parseOptionalBodyTimestamp(value);
  return d ?? null;
}

export type CreateActionRequestBodyTimestamps = {
  dueDate?: string | null;
  checkIn?: string | null;
};

/** Maps optional `dueDate` / `checkIn` from the request body to nullable `Date` for Drizzle insert. */
export function normalizeCreateActionTimestamps(body: CreateActionRequestBodyTimestamps): {
  dueDate: Date | null;
  checkIn: Date | null;
} {
  return {
    dueDate: optionalBodyTimestampToDb(body.dueDate),
    checkIn: optionalBodyTimestampToDb(body.checkIn),
  };
}
