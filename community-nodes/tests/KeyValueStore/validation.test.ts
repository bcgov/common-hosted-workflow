import { describe, expect, it } from 'vitest';
import { createExecutionContext, executeWith } from './helpers';
import { normalizePairs, toObject } from '../../nodes/KeyValueStore/shared/pairs';
import { KeyValueStore } from '../../nodes/KeyValueStore/KeyValueStore.node';

const privateValue = 'Dummy-private-credential-value';
const validRow = { name: 'valid', value: 'control' };
const credential = (values: unknown) => ({ pairs: { values } });
const invalidRows: Array<[string, unknown, string]> = [
  ['null', null, 'Pair must be an object'],
  ['undefined', undefined, 'Pair must be an object'],
  ['array', [], 'Pair must be an object'],
  ['string', privateValue, 'Pair must be an object'],
  ['number', 7, 'Pair must be an object'],
  ['boolean', true, 'Pair must be an object'],
  ['non-record object', new Date(0), 'Pair must be an object'],
  ['empty object', {}, 'Key must be a string'],
  ['missing key', { value: privateValue }, 'Key must be a string'],
  ['missing value', { name: 'configured' }, 'Value must be a string'],
  ['missing value on blank key', { name: '' }, 'Value must be a string'],
  ['missing key on blank value', { value: '' }, 'Key must be a string'],
  ['numeric key', { name: 1, value: privateValue }, 'Key must be a string'],
  ['null key', { name: null, value: privateValue }, 'Key must be a string'],
  ['object key', { name: { privateValue }, value: privateValue }, 'Key must be a string'],
  ['array key', { name: [privateValue], value: privateValue }, 'Key must be a string'],
  ['boolean key', { name: false, value: privateValue }, 'Key must be a string'],
  ['numeric value', { name: 'configured', value: 42 }, 'Value must be a string'],
  ['null value', { name: 'configured', value: null }, 'Value must be a string'],
  ['object value', { name: 'configured', value: { privateValue } }, 'Value must be a string'],
  ['array value', { name: 'configured', value: [privateValue] }, 'Value must be a string'],
  ['boolean value', { name: 'configured', value: false }, 'Value must be a string'],
  ['populated value without key', { name: '', value: privateValue }, 'Key must not be blank'],
  ['whitespace value without key', { name: '', value: ' \t\n' }, 'Key must not be blank'],
  ['whitespace key', { name: ' \t\n', value: privateValue }, 'Key must not be blank'],
  ['whitespace key and blank value', { name: ' ', value: '' }, 'Key must not be blank'],
  ['Unicode whitespace key', { name: '\u00a0\u2003', value: privateValue }, 'Key must not be blank'],
  ...['__proto__', 'constructor', 'prototype'].map((name): [string, unknown, string] => [
    `reserved ${name}`,
    { name, value: privateValue },
    'Key is reserved',
  ]),
  ['unknown field', { ...validRow, [privateValue]: privateValue }, 'Unexpected field'],
  ['unknown field on placeholder', { name: '', value: '', unexpected: privateValue }, 'Unexpected field'],
];

describe('strict credential validation', () => {
  it.each([
    ['missing credential', undefined],
    ['null credential', null],
    ['string credential', privateValue],
    ['array credential', []],
    ['number credential', 42],
    ['boolean credential', false],
    ['non-record credential', new Date(0)],
    ['null pairs', { pairs: null }],
    ['array pairs', { pairs: [] }],
    ['string pairs', { pairs: privateValue }],
    ['number pairs', { pairs: 42 }],
    ['boolean pairs', { pairs: false }],
    ['undefined pairs', { pairs: undefined }],
    ['non-record pairs', { pairs: new Date(0) }],
    ['unknown collection', { pairs: { wrong: privateValue } }],
    ['extra collection', { pairs: { values: [], wrong: privateValue } }],
    ['null values', credential(null)],
    ['string values', credential(privateValue)],
    ['object values', credential({ name: 'key', value: privateValue })],
    ['number values', credential(42)],
    ['boolean values', credential(false)],
    ['undefined values', credential(undefined)],
  ])('rejects %s without echoing supplied values', (_label, input) => {
    expect(() => normalizePairs(input)).toThrow(/Key Value Store credential/);
    try {
      normalizePairs(input);
    } catch (error) {
      expect((error as Error).message).not.toContain(privateValue);
    }
  });

  it.each(invalidRows)('rejects %s with the original one-based row index', (_label, row, message) => {
    expect(() => normalizePairs(credential([validRow, { name: '', value: '' }, row]))).toThrow(
      `Key Value Store credential row 3: ${message}`,
    );
  });

  it('preserves strings, exact key whitespace/case, insertion order, and input objects', () => {
    const rows = [
      { name: '', value: '' },
      { name: ' spaced ', value: ' \tvalue\n' },
      { name: 'spaced', value: '' },
      { name: 'Spaced', value: ' ' },
      { name: 'toString', value: 'false' },
      { name: 'hasOwnProperty', value: '42' },
      { name: ' constructor ', value: 'null' },
      { name: 'é', value: '雪' },
      { name: 'e\u0301', value: '{}' },
    ];
    rows.forEach(Object.freeze);
    Object.freeze(rows);
    const result = normalizePairs(credential(rows));
    expect(result).toEqual(rows.slice(1));
    result[0].value = 'changed';
    expect(rows[1].value).toBe(' \tvalue\n');
  });

  it('rejects exact duplicates even with blank rows between them and empty values', () => {
    expect(() =>
      normalizePairs(
        credential([
          { name: privateValue, value: '' },
          { name: '', value: '' },
          { name: privateValue, value: '' },
        ]),
      ),
    ).toThrow('Key Value Store credential row 3: Duplicate key');
    try {
      normalizePairs(
        credential([
          { name: privateValue, value: privateValue },
          { name: privateValue, value: privateValue },
        ]),
      );
    } catch (error) {
      expect((error as Error).message).not.toContain(privateValue);
    }
  });

  it('validates the object helper boundary, including prototype-setting keys', () => {
    expect(() => toObject([{ name: '__proto__', value: privateValue }])).toThrow('row 1: Key is reserved');
    expect(() => toObject([{ name: ' ', value: '' }])).toThrow('row 1: Key must not be blank');
  });

  it('accepts null-prototype records and ignores unrelated top-level metadata', () => {
    const row = Object.assign(Object.create(null), validRow);
    const input = Object.assign(Object.create(null), {
      metadata: privateValue,
      pairs: Object.assign(Object.create(null), { values: [row] }),
    });
    expect(normalizePairs(input)).toEqual([validRow]);
    expect(normalizePairs({ metadata: privateValue })).toEqual([]);
  });

  it('rejects holes in the row array rather than silently dropping them', () => {
    const rows = [validRow];
    rows.length = 2;
    expect(() => normalizePairs(credential(rows))).toThrow('row 2: Pair must be an object');
  });
});

describe.each(['both', 'object', 'array'])('%s output validation', (outputFormat) => {
  it.each(invalidRows)('rejects %s before producing any output and omits values', async (_label, row, message) => {
    const ctx = createExecutionContext({
      credentials: credential([validRow, row]),
      params: { outputFormat },
      inputItems: [{ json: { id: 1 } }, { json: { id: 2 } }],
      continueOnFail: true,
    });
    const execution = new KeyValueStore().execute.call(ctx as never);
    await expect(execution).rejects.toMatchObject({
      name: 'NodeOperationError',
      message: `Key Value Store credential row 2: ${message}`,
    });
    await expect(execution).rejects.not.toThrow(privateValue);
    expect(ctx.helpers.returnJsonArray).not.toHaveBeenCalled();
    expect(ctx.helpers.constructExecutionMetaData).not.toHaveBeenCalled();
  });

  it.each([false, true])('rejects duplicates with Continue On Fail = %s', async (continueOnFail) => {
    await expect(
      executeWith({
        credentials: credential([validRow, validRow]),
        params: { outputFormat },
        continueOnFail,
      }),
    ).rejects.toThrow('row 2: Duplicate key');
  });

  it('rejects malformed containers as a contextual setup error', async () => {
    await expect(
      executeWith({ credentials: credential(privateValue), params: { outputFormat } }),
    ).rejects.toMatchObject({
      name: 'NodeOperationError',
      message: 'Key Value Store credential Pairs.values must be an array',
    });
  });

  it.each([{}, { pairs: {} }, credential([]), credential([{ name: '', value: '' }])])(
    'projects intentionally empty configuration %j',
    async (credentials) => {
      const { result } = await executeWith({ credentials, params: { outputFormat } });
      expect(result).toEqual([
        [
          {
            json: {
              ...(outputFormat !== 'array' ? { values: {} } : {}),
              ...(outputFormat !== 'object' ? { pairs: [] } : {}),
            },
            pairedItem: { item: 0 },
          },
        ],
      ]);
    },
  );

  it('replaces JSON/binary with independent per-item copies and exact pairing', async () => {
    const rows = [
      { name: ' key ', value: ' \tvalue\n' },
      { name: 'empty', value: '' },
    ];
    const inputItems = [
      {
        json: { discard: 'first' },
        binary: { data: { data: 'YQ==', mimeType: 'text/plain' } },
        pairedItem: { item: 10 },
      },
      { json: { discard: 'second' }, pairedItem: { item: 11 } },
    ];
    const { result, ctx } = await executeWith({ credentials: credential(rows), params: { outputFormat }, inputItems });
    const expected = {
      ...(outputFormat !== 'array' ? { values: { ' key ': ' \tvalue\n', empty: '' } } : {}),
      ...(outputFormat !== 'object' ? { pairs: rows } : {}),
    };
    expect(result).toEqual([
      [
        { json: expected, pairedItem: { item: 0 } },
        { json: expected, pairedItem: { item: 1 } },
      ],
    ]);
    expect(ctx.getCredentials).toHaveBeenCalledExactlyOnceWith('keyValueStore');
    expect(ctx.getNodeParameter).toHaveBeenCalledExactlyOnceWith('outputFormat', 0, 'both');
    expect(result[0][0].json).not.toBe(result[0][1].json);
    if (outputFormat !== 'array') {
      (result[0][0].json.values as Record<string, string>)[' key '] = 'mutated object';
    }
    if (outputFormat !== 'object') {
      const firstPairs = result[0][0].json.pairs as Array<{ name: string; value: string }>;
      expect(firstPairs).not.toBe(result[0][1].json.pairs);
      expect(firstPairs[0]).not.toBe(rows[0]);
      expect(firstPairs[0]).not.toBe((result[0][1].json.pairs as unknown[])[0]);
      expect(firstPairs[0].value).toBe(' \tvalue\n');
      firstPairs[0].value = 'mutated pair';
      firstPairs.push({ name: 'extra', value: '' });
    }
    expect(result[0][1].json).toEqual(expected);
    expect(rows).toEqual([
      { name: ' key ', value: ' \tvalue\n' },
      { name: 'empty', value: '' },
    ]);
    expect(inputItems[0].json).toEqual({ discard: 'first' });
    expect(inputItems[0].binary?.data.data).toBe('YQ==');
  });
});

describe('execution-wide setup validation', () => {
  it.each(['unsupported', '', 'BOTH', ' object ', null, 7, true, [], {}].map((outputFormat) => ({ outputFormat })))(
    'rejects invalid outputFormat $outputFormat',
    async ({ outputFormat }) => {
      await expect(executeWith({ params: { outputFormat } })).rejects.toMatchObject({
        name: 'NodeOperationError',
        message: 'Output Format (outputFormat) must be both, object, or array',
      });
    },
  );

  it('uses the defined default when outputFormat is undefined', async () => {
    const { result } = await executeWith({ params: { outputFormat: undefined } });
    expect(result[0][0].json).toHaveProperty('values');
    expect(result[0][0].json).toHaveProperty('pairs');
  });

  it('returns no items for empty input after validating setup', async () => {
    expect((await executeWith({ inputItems: [] })).result).toEqual([[]]);
    await expect(executeWith({ inputItems: [], credentials: credential([null]) })).rejects.toThrow('row 1');
    await expect(executeWith({ inputItems: [], params: { outputFormat: 'bad' } })).rejects.toThrow('outputFormat');
  });

  it('propagates credential retrieval failure before producing output', async () => {
    const ctx = createExecutionContext({ continueOnFail: true });
    ctx.getCredentials.mockRejectedValue(new Error('Credential unavailable'));
    await expect(new KeyValueStore().execute.call(ctx as never)).rejects.toThrow('Credential unavailable');
    expect(ctx.helpers.returnJsonArray).not.toHaveBeenCalled();
  });

  it('models missing n8n parameters with defined fallbacks', () => {
    const ctx = createExecutionContext({});
    expect(() => ctx.getNodeParameter('missing', 0)).toThrow('Could not get parameter');
    expect(ctx.getNodeParameter('missing', 0, 'fallback')).toBe('fallback');
  });
});
