import type { WilInputField, WilInputFieldType } from '../../../services/backend/trigger-types';

/** Text shown in the editor for a stored value. */
export function formatInputValue(type: WilInputFieldType, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (type === 'object' || type === 'array' || typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/** An unset value, a parse error, or the parsed value. */
export type ParseError = { error: string };
export type ParsedInputValue = undefined | ParseError | string | number | boolean | object;

function parseNumberValue(text: string): number | ParseError {
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : { error: 'Enter a valid number' };
}

function parseBooleanValue(text: string): boolean | ParseError {
  if (text === 'true') return true;
  if (text === 'false') return false;
  return { error: 'Choose true or false' };
}

function parseJsonValue(type: 'object' | 'array', text: string): object | ParseError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'Enter valid JSON' };
  }
  if (type === 'array') {
    return Array.isArray(parsed) ? parsed : { error: 'Enter a JSON array' };
  }
  const isPlainObject = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  return isPlainObject ? (parsed as object) : { error: 'Enter a JSON object' };
}

/**
 * Converts editor text to the typed value the backend validates.
 * Returns `undefined` for "unset" and `{ error }` for text that is not valid for the type.
 */
export function parseInputValue(type: WilInputFieldType, raw: string): ParsedInputValue {
  const text = raw.trim();
  if (text === '') return undefined;
  switch (type) {
    case 'number':
      return parseNumberValue(text);
    case 'boolean':
      return parseBooleanValue(text);
    case 'object':
    case 'array':
      return parseJsonValue(type, text);
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
