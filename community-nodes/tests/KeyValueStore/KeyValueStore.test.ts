import { describe, expect, it } from 'vitest';
import { normalizePairs, toObject } from '../../nodes/KeyValueStore/shared/pairs';
import { KeyValueStore } from '../../nodes/KeyValueStore/KeyValueStore.node';
import { cloneCreds, executeWith } from './helpers';

describe('normalizePairs', () => {
  it('returns an empty array for missing or malformed credential shapes', () => {
    expect(normalizePairs(undefined)).toEqual([]);
    expect(normalizePairs(null)).toEqual([]);
    expect(normalizePairs({})).toEqual([]);
    expect(normalizePairs({ pairs: {} })).toEqual([]);
    expect(normalizePairs({ pairs: { values: 'nope' } })).toEqual([]);
  });

  it('skips empty names and unsafe keys', () => {
    expect(
      normalizePairs({
        pairs: {
          values: [
            { name: '', value: 'blank' },
            { name: '__proto__', value: 'polluted' },
            { name: 'ok', value: 'yes' },
          ],
        },
      }),
    ).toEqual([{ name: 'ok', value: 'yes' }]);
  });
});

describe('toObject', () => {
  it('converts pairs to an object', () => {
    expect(
      toObject([
        { name: 'a', value: '1' },
        { name: 'b', value: '2' },
      ]),
    ).toEqual({ a: '1', b: '2' });
  });

  it('throws on duplicate keys', () => {
    expect(() =>
      toObject([
        { name: 'a', value: '1' },
        { name: 'a', value: '2' },
      ]),
    ).toThrow('Duplicate key "a"');
  });
});

describe('KeyValueStore node', () => {
  it('outputs both the values object and the pairs array by default', async () => {
    const { result } = await executeWith({ credentials: cloneCreds() });
    expect(result[0][0].json.values).toEqual({ apiUrl: 'https://example.com', apiKey: 's3cret' }); // pragma: allowlist secret
    expect(result[0][0].json.pairs).toEqual([
      { name: 'apiUrl', value: 'https://example.com' },
      { name: 'apiKey', value: 's3cret' }, // pragma: allowlist secret
    ]);
    expect(result[0][0].pairedItem).toEqual({ item: 0 });
  });

  it('supports object-only and array-only output formats', async () => {
    const objectOnly = await executeWith({ credentials: cloneCreds(), params: { outputFormat: 'object' } });
    expect(objectOnly.result[0][0].json).toHaveProperty('values');
    expect(objectOnly.result[0][0].json).not.toHaveProperty('pairs');

    const arrayOnly = await executeWith({ credentials: cloneCreds(), params: { outputFormat: 'array' } });
    expect(arrayOnly.result[0][0].json).toHaveProperty('pairs');
    expect(arrayOnly.result[0][0].json).not.toHaveProperty('values');
  });

  it('declares sensitive output fields for redaction', () => {
    const node = new KeyValueStore();
    expect(node.description.sensitiveOutputFields).toContain('pairs[*].value');
    expect(node.description.sensitiveOutputFields).toContain('values');
  });

  it('treats prototype names as regular keys', () => {
    expect(toObject([{ name: 'toString', value: 'x' }])).toEqual({ toString: 'x' });
  });

  it('throws on duplicate keys', async () => {
    await expect(
      executeWith({
        credentials: cloneCreds({
          pairs: {
            values: [
              { name: 'a', value: '1' },
              { name: 'a', value: '2' },
            ],
          },
        }),
      }),
    ).rejects.toThrow('Duplicate key "a"');
  });

  it('returns empty outputs when the credential has no pairs', async () => {
    const { result } = await executeWith({ credentials: cloneCreds({ pairs: { values: [] } }) });
    expect(result[0][0].json.values).toEqual({});
    expect(result[0][0].json.pairs).toEqual([]);
  });

  it('emits one output item per input item', async () => {
    const { result } = await executeWith({
      credentials: cloneCreds(),
      inputItems: [{ json: { id: 1 } }, { json: { id: 2 } }],
    });
    expect(result[0]).toHaveLength(2);
    expect(result[0][0].pairedItem).toEqual({ item: 0 });
    expect(result[0][1].pairedItem).toEqual({ item: 1 });
  });
});
