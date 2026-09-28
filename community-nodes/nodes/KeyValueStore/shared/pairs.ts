export interface KeyValuePair {
  name: string;
  value: string;
}

export interface KeyValueStoreCredentials {
  pairs?: { values?: unknown };
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isSafeKey(key: string): boolean {
  return !UNSAFE_KEYS.has(key);
}

export function normalizePairs(input: unknown): KeyValuePair[] {
  if (!isRecord(input)) throw new Error('Key Value Store credential must be an object');
  if (!Object.prototype.hasOwnProperty.call(input, 'pairs')) return [];
  const container = input.pairs;
  if (!isRecord(container)) throw new Error('Key Value Store credential Pairs must be an object');
  if (Object.keys(container).some((key) => key !== 'values')) {
    throw new Error('Key Value Store credential Pairs contains an unexpected field');
  }
  if (!Object.prototype.hasOwnProperty.call(container, 'values')) return [];
  if (!Array.isArray(container.values)) throw new Error('Key Value Store credential Pairs.values must be an array');
  return normalizeRows(container.values);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeRows(rows: unknown[]): KeyValuePair[] {
  const pairs: KeyValuePair[] = [];
  const names = new Set<string>();
  for (const [index, entry] of rows.entries()) {
    // Never interpolate field names or values: both come from credential data.
    const invalid = (message: string) => new Error(`Key Value Store credential row ${index + 1}: ${message}`);
    if (!isRecord(entry)) throw invalid('Pair must be an object');
    if (Object.keys(entry).some((key) => key !== 'name' && key !== 'value')) throw invalid('Unexpected field');
    const { name, value } = entry;
    if (typeof name !== 'string') throw invalid('Key must be a string');
    if (typeof value !== 'string') throw invalid('Value must be a string');
    // Only the exact untouched UI default is a placeholder; partial rows are errors.
    if (name === '' && value === '') continue;
    if (name.trim() === '') throw invalid('Key must not be blank');
    if (!isSafeKey(name)) throw invalid('Key is reserved');
    if (names.has(name)) throw invalid('Duplicate key');
    names.add(name);
    pairs.push({ name, value });
  }
  return pairs;
}

export function toObject(pairs: KeyValuePair[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of normalizeRows(pairs)) {
    out[pair.name] = pair.value;
  }
  return out;
}
