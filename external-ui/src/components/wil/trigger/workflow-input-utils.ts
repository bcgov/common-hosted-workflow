import type { WilInputField, WilInputFieldType } from '../../../services/backend/trigger-types';

/** Text shown in the editor for a stored value. */
export function formatInputValue(type: WilInputFieldType, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (type === 'object' || type === 'array') return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return String(value);
}

/**
 * Converts editor text to the typed value the backend validates.
 * Returns `undefined` for "unset" and `{ error }` for text that is not valid for the type.
 */
export function parseInputValue(type: WilInputFieldType, raw: string): unknown | { error: string } {
  const text = raw.trim();
  if (text === '') return undefined;
  switch (type) {
    case 'number': {
      const parsed = Number(text);
      return Number.isFinite(parsed) ? parsed : { error: 'Enter a valid number' };
    }
    case 'boolean':
      return text === 'true' ? true : text === 'false' ? false : { error: 'Choose true or false' };
    case 'object':
    case 'array':
      try {
        const parsed: unknown = JSON.parse(text);
        const ok =
          type === 'array'
            ? Array.isArray(parsed)
            : typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
        return ok ? parsed : { error: type === 'array' ? 'Enter a JSON array' : 'Enter a JSON object' };
      } catch {
        return { error: 'Enter valid JSON' };
      }
    default:
      return raw;
  }
}

export function isParseError(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'error' in value &&
    Object.keys(value).length === 1
  );
}

/** Drops unset values and values for fields the node no longer declares. */
export function pruneInputValues(schema: WilInputField[], values: Record<string, unknown>): Record<string, unknown> {
  const declared = new Set(schema.map((field) => field.name));
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => declared.has(key) && value !== undefined && value !== ''),
  );
}
