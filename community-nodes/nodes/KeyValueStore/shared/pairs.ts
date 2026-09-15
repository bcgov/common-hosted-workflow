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
  if (!input || typeof input !== 'object') return [];
  const container = (input as KeyValueStoreCredentials).pairs;
  if (!container || typeof container !== 'object') return [];
  const values = (container as { values?: unknown }).values;
  if (!Array.isArray(values)) return [];
  const pairs: KeyValuePair[] = [];
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') continue;
    const { name, value } = entry as { name?: unknown; value?: unknown };
    if (typeof name !== 'string' || name === '') continue;
    if (typeof value !== 'string') continue;
    if (!isSafeKey(name)) continue;
    pairs.push({ name, value });
  }
  return pairs;
}

export function toObject(pairs: KeyValuePair[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    if (Object.prototype.hasOwnProperty.call(out, pair.name)) {
      throw new Error(`Duplicate key "${pair.name}" in Key Value Store credential`);
    }
    out[pair.name] = pair.value;
  }
  return out;
}
