import { describe, expect, it } from 'vitest';
import { createExecutionContext, defaultOutputEntries, executeWith, manualDiscountParams } from './helpers';
import { discountBandTable, SAMPLE_DMN_XML } from './fixtures';

describe('DMN collection parameter boundaries', () => {
  it('models n8n missing paths and defined fallbacks', () => {
    const ctx = createExecutionContext({ params: { defaultOutputs: {} } });
    expect(() => ctx.getNodeParameter('defaultOutputs.definitions', 0)).toThrow(/Could not get parameter/);
    expect(ctx.getNodeParameter('defaultOutputs.definitions', 0, [])).toEqual([]);
    expect(ctx.getNodeParameter('defaultOutputs', 0, {})).toEqual({});
    expect(() => ctx.getNodeParameter('absent', 0, undefined)).toThrow(/Could not get parameter/);
  });

  it.each([undefined, {}, { definitions: [] }])(
    'runs manual tables with empty defaults: %j',
    async (defaultOutputs) => {
      const { result } = await executeWith({
        params: manualDiscountParams({ defaultOutputs }),
        inputItems: [{ json: { spend: 1200, tier: 'gold' } }, { json: { spend: 1, tier: 'bronze' } }],
      });
      expect(result[0]).toEqual([
        { json: { spend: 1200, tier: 'gold', discount: 0.2, label: 'vip' }, pairedItem: { item: 0 } },
        { json: { spend: 1, tier: 'bronze' }, pairedItem: { item: 1 } },
      ]);
    },
  );

  it.each([undefined, {}, { definitions: [] }])(
    'uses embedded JSON defaults with empty entries: %j',
    async (defaultOutputs) => {
      const { result } = await executeWith({
        params: { tableSource: 'json', tableJson: discountBandTable(), defaultOutput: {}, defaultOutputs },
        inputItems: [{ json: { spend: 1200, tier: 'gold' } }, { json: { spend: 1, tier: 'bronze' } }],
      });
      expect(result[0][0]).toMatchObject({ json: { discount: 0.2 }, pairedItem: { item: 0 } });
      expect(result[0][1]).toMatchObject({ json: { discount: 0, label: 'none' }, pairedItem: { item: 1 } });
    },
  );

  it.each([undefined, {}])('runs XML matching and nonmatching inputs without defaults: %j', async (defaultOutputs) => {
    const { result } = await executeWith({
      params: { tableSource: 'dmnXml', decisionId: 'other', dmnXml: SAMPLE_DMN_XML, defaultOutputs },
      inputItems: [{ json: { flag: true } }, { json: { flag: false } }],
    });
    expect(result[0]).toEqual([
      { json: { flag: true, result: true }, pairedItem: { item: 0 } },
      { json: { flag: false }, pairedItem: { item: 1 } },
    ]);
  });

  it.each([{}, { entries: [] }])('allows an empty rule collection: %j', async (rules) => {
    const { result } = await executeWith({ params: manualDiscountParams({ rules }) });
    expect(result[0][0].json).toEqual({ discount: 0, label: 'none' });
  });

  it.each([undefined, {}, { values: [] }])('allows empty optional rule inputs: %j', async (inputEntries) => {
    const params = manualDiscountParams({ defaultOutputs: {} });
    params.rules = {
      entries: [
        {
          inputEntries,
          outputEntries: {
            values: [
              { outputName: 'discount', value: '0.3' },
              { outputName: 'label', value: 'wildcard' },
            ],
          },
        },
      ],
    };
    const { result } = await executeWith({ params });
    expect(result[0][0].json).toEqual({ discount: 0.3, label: 'wildcard' });
  });

  const malformedCollections = [
    null,
    '',
    7,
    [],
    { wrongOption: [] },
    { definitions: {} },
    { definitions: null },
    { definitions: [null] },
    { definitions: [[]] },
    { definitions: ['row'] },
  ];
  it.each(malformedCollections)('rejects malformed default collections with context: %j', async (defaultOutputs) => {
    await expect(executeWith({ params: manualDiscountParams({ defaultOutputs }) })).rejects.toThrow(/defaultOutputs/);
  });

  it.each(['inputs', 'outputs', 'rules'])('rejects malformed %s before evaluation', async (name) => {
    await expect(
      executeWith({
        params: manualDiscountParams({ [name]: { unexpected: [{}] } }),
        continueOnFail: true,
      }),
    ).rejects.toThrow(new RegExp(name));
  });

  it.each([null, [], 'bad', { wrongOption: [] }, { values: {} }, { values: [null] }])(
    'rejects malformed nested collections instead of widening a rule: %j',
    async (inputEntries) => {
      const params = manualDiscountParams();
      (params.rules as { entries: Array<{ inputEntries: unknown }> }).entries[0].inputEntries = inputEntries;
      await expect(executeWith({ params })).rejects.toThrow(/Rule 1.*inputEntries/);
    },
  );

  it.each([
    ['inputs', { definitions: [{ name: 7 }] }, /inputs.definitions.*row 1.*name/],
    ['outputs', { definitions: [{ name: false }] }, /outputs.definitions.*row 1.*name/],
    [
      'defaultOutputs',
      { definitions: [{ outputName: 'discount', value: 7 }] },
      /defaultOutputs.definitions.*row 1.*value/,
    ],
  ])('rejects nonstring row fields in %s with context', async (name, value, message) => {
    await expect(executeWith({ params: manualDiscountParams({ [name as string]: value }) })).rejects.toThrow(
      message as RegExp,
    );
  });

  it('recovers from per-item malformed defaults with pairing', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({
        defaultOutputs: (index: number) =>
          index === 0 ? { definitions: {} } : defaultOutputEntries({ discount: 0, label: 'recovered' }),
      }),
      inputItems: [{ json: { spend: 1 } }, { json: { spend: 1 } }],
      continueOnFail: true,
    });
    expect(result[0]).toHaveLength(2);
    expect(result[0][0]).toEqual({
      json: { error: expect.stringMatching(/defaultOutputs.definitions.*array/) },
      pairedItem: { item: 0 },
    });
    expect(result[0][1]).toEqual({
      json: { spend: 1, discount: 0, label: 'recovered' },
      pairedItem: { item: 1 },
    });
  });

  it.each(['inputEntries', 'outputEntries'])('rejects nonstring cells in %s with rule/row context', async (name) => {
    const params = manualDiscountParams();
    const rules = params.rules as { entries: Array<Record<string, unknown>> };
    rules.entries[0][name] =
      name === 'inputEntries'
        ? { values: [{ inputName: 'spend', expression: null }] }
        : { values: [{ outputName: 'discount', value: 7 }] };
    await expect(executeWith({ params })).rejects.toThrow(new RegExp(`Rule 1 ${name}.values.*row 1.*string`));
  });

  it('recovers from a malformed per-item input collection and resolves later values', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({
        inputs: (index: number) =>
          index === 1
            ? { definitions: {} }
            : {
                definitions: [
                  { name: 'spend', value: index === 0 ? 700 : 1200 },
                  { name: 'tier', value: 'gold' },
                ],
              },
      }),
      inputItems: [{ json: {} }, { json: {} }, { json: {} }],
      continueOnFail: true,
    });
    expect(result[0]).toEqual([
      { json: { discount: 0.1, label: 'standard' }, pairedItem: { item: 0 } },
      { json: { error: expect.stringMatching(/inputs.definitions.*array/) }, pairedItem: { item: 1 } },
      { json: { discount: 0.2, label: 'vip' }, pairedItem: { item: 2 } },
    ]);
  });

  it('rejects malformed foreign collection structure while preserving default precedence', async () => {
    const params = { tableSource: 'json', tableJson: discountBandTable(), defaultOutputs: { wrongOption: [] } };
    await expect(executeWith({ params })).rejects.toThrow(/defaultOutputs/);
    const { result } = await executeWith({ params: { ...params, defaultOutput: { discount: 99 } } });
    expect(result[0][0].json).toEqual({ discount: 99 });
  });
});
