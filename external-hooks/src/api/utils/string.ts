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
