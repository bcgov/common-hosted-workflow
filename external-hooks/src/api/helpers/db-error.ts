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
