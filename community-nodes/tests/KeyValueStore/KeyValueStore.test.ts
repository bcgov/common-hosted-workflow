import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cloneCreds, executeWith } from './helpers';
import { normalizePairs, toObject } from '../../nodes/KeyValueStore/shared/pairs';
import { KeyValueStore } from '../../nodes/KeyValueStore/KeyValueStore.node';
import { KeyValueStore as KeyValueStoreCredential } from '../../credentials/KeyValueStore.credentials';

describe('normalizePairs', () => {
  it('returns an empty array for intentionally empty credentials', () => {
    expect(normalizePairs({})).toEqual([]);
    expect(normalizePairs({ pairs: {} })).toEqual([]);
    expect(normalizePairs({ pairs: { values: [] } })).toEqual([]);
  });

  it('skips only untouched blank UI rows', () => {
    expect(
      normalizePairs({
        pairs: {
          values: [
            { name: '', value: '' },
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
    ).toThrow('row 2: Duplicate key');
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

  it('preserves serialized node, credential and property identifiers', () => {
    const node = new KeyValueStore();
    const credential = new KeyValueStoreCredential();
    expect(node.description.name).toBe('keyValueStore');
    expect(node.description.version).toBe(1);
    expect(node.description.credentials).toEqual([{ name: 'keyValueStore', required: true }]);
    expect(node.description.properties).toHaveLength(1);
    expect(node.description.properties[0]).toMatchObject({
      name: 'outputFormat',
      noDataExpression: true,
      default: 'both',
      options: [{ value: 'both' }, { value: 'object' }, { value: 'array' }],
    });
    expect(credential.name).toBe('keyValueStore');
    expect(credential.properties[0]).toMatchObject({
      name: 'pairs',
      default: { values: [{ name: '', value: '' }] },
      options: [{ name: 'values', values: [{ name: 'name' }, { name: 'value', typeOptions: { password: true } }] }],
    });
    expect(normalizePairs({ pairs: credential.properties[0].default })).toEqual([]);
  });

  it('links node and credential help to canonical local documentation routes', () => {
    const metadata = JSON.parse(
      readFileSync(new URL('../../nodes/KeyValueStore/KeyValueStore.node.json', import.meta.url), 'utf8'),
    );
    const base = 'https://bcgov.github.io/common-hosted-workflow/community-nodes/key-value-store';
    expect(metadata.node).toBe('community-nodes.keyValueStore');
    expect(metadata.resources.primaryDocumentation).toEqual([{ url: base }]);
    expect(metadata.resources.credentialDocumentation).toEqual([{ url: `${base}/credentials` }]);
    expect(new KeyValueStoreCredential().documentationUrl).toBe(`${base}/credentials`);
    for (const file of ['README.md', 'credentials.md', 'node-operations.md', 'release-notes.md']) {
      const guide = readFileSync(
        new URL(`../../../docs/community-nodes/key-value-store/${file}`, import.meta.url),
        'utf8',
      );
      expect(guide).toMatch(/^# Key Value Store/);
    }
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
    ).rejects.toThrow('row 2: Duplicate key');
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
