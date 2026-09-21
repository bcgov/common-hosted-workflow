import { describe, expect, it } from 'vitest';
import { DmnDecisionTable } from '../../nodes/DmnDecisionTable/DmnDecisionTable.node';
import { SAMPLE_DMN_XML } from './fixtures';
import { defaultOutputEntries, executeWith, manualDiscountParams } from './helpers';

describe('DmnDecisionTable node (manual source)', () => {
  it('keeps rule descriptions without affecting matching', async () => {
    const params = manualDiscountParams();
    (params.rules as { entries: Array<{ description?: string }> }).entries[0].description = 'VIP band';
    const { result } = await executeWith({
      params,
      inputItems: [{ json: { spend: 1200, tier: 'gold' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 0.2, label: 'vip' });
  });

  it('accepts bare string output values matching the declared type', async () => {
    const params = manualDiscountParams();
    const rules = params.rules as { entries: Array<{ outputEntries: { values: Array<{ value: string }> } }> };
    rules.entries[0].outputEntries.values[1].value = 'vip';
    const { result } = await executeWith({
      params,
      inputItems: [{ json: { spend: 1200, tier: 'gold' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 0.2, label: 'vip' });
  });

  it('merges decision outputs into the item and keeps input fields', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams(),
      inputItems: [{ json: { spend: 1200, tier: 'gold', extra: 'kept' } }],
    });
    expect(result[0][0].json).toMatchObject({ spend: 1200, tier: 'gold', extra: 'kept', discount: 0.2, label: 'vip' });
    expect(result[0][0].pairedItem).toEqual({ item: 0 });
  });

  it('loops over multiple items with per-item results', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams(),
      inputItems: [{ json: { spend: 5, tier: 'bronze' } }, { json: { spend: 700, tier: 'bronze' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 0, label: 'none' });
    expect(result[0][1].json).toMatchObject({ discount: 0.1, label: 'standard' });
    expect(result[0][1].pairedItem).toEqual({ item: 1 });
  });

  it('supports single result key output mode', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({ outputMode: 'single', resultKey: 'band' }),
      inputItems: [{ json: { spend: 1200, tier: 'gold' } }],
    });
    expect(result[0][0].json).toMatchObject({ spend: 1200, band: { discount: 0.2, label: 'vip' } });
  });

  it('honors null and error no-match behaviors', async () => {
    const nulled = await executeWith({
      params: manualDiscountParams({ noMatchBehavior: 'null' }),
      inputItems: [{ json: { spend: 1, tier: 'bronze' } }],
    });
    expect(nulled.result[0][0].json).toMatchObject({ discount: null, label: null });

    await expect(
      executeWith({
        params: manualDiscountParams({ noMatchBehavior: 'error' }),
        inputItems: [{ json: { spend: 1, tier: 'bronze' } }],
      }),
    ).rejects.toThrow(/No rule matched/);
  });

  it('recovers per item when continueOnFail is enabled', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({ noMatchBehavior: 'error' }),
      inputItems: [{ json: { spend: 1, tier: 'bronze' } }, { json: { spend: 700, tier: 'bronze' } }],
      continueOnFail: true,
    });
    expect(result[0][0].json).toHaveProperty('error');
    expect(result[0][1].json).toMatchObject({ discount: 0.1 });
  });

  it('fails fast on invalid manual tables', async () => {
    const params = manualDiscountParams();
    (params.inputs as { definitions: Array<{ name: string; type: string }> }).definitions[0].name = '';
    await expect(executeWith({ params, inputItems: [{ json: {} }] })).rejects.toThrow(/Invalid input name/);
  });
});

describe('DmnDecisionTable node (json and dmnXml sources)', () => {
  it('evaluates a table provided as JSON', async () => {
    const { result } = await executeWith({
      params: {
        tableSource: 'json',
        tableJson: {
          hitPolicy: 'FIRST',
          inputs: [{ name: 'flag', type: 'boolean' }],
          outputs: [{ name: 'result', type: 'string' }],
          rules: [
            {
              inputEntries: [{ inputName: 'flag', expression: 'true' }],
              outputEntries: [{ outputName: 'result', value: '"yes"' }],
            },
          ],
          defaultOutput: { result: 'no' },
        },
        noMatchBehavior: 'default',
        outputMode: 'merge',
      },
      inputItems: [{ json: { flag: true } }],
    });
    expect(result[0][0].json).toMatchObject({ result: 'yes' });
  });

  it('rejects invalid JSON source', async () => {
    await expect(
      executeWith({
        params: { tableSource: 'json', tableJson: '{oops', noMatchBehavior: 'default', outputMode: 'merge' },
        inputItems: [{ json: {} }],
      }),
    ).rejects.toThrow(/invalid JSON/);
  });

  it.each(['', '{}'])('rejects empty Table JSON (%s) instead of evaluating an example', async (tableJson) => {
    await expect(
      executeWith({
        params: { tableSource: 'json', tableJson, noMatchBehavior: 'default', outputMode: 'merge' },
        inputItems: [{ json: {} }],
      }),
    ).rejects.toThrow(/Table JSON must not be empty/);
  });

  it('evaluates a decision imported from DMN XML', async () => {
    const { result } = await executeWith({
      params: {
        tableSource: 'dmnXml',
        decisionId: 'discountBand',
        dmnXml: SAMPLE_DMN_XML,
        noMatchBehavior: 'default',
        outputMode: 'merge',
      },
      inputItems: [{ json: { spend: 5000, tier: 'gold' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 0.2 });
  });
});

describe('DmnDecisionTable node (manual input values)', () => {
  const valuedInputs = (value: unknown) => ({
    definitions: [
      { name: 'spend', type: 'number', value },
      { name: 'tier', type: 'string' },
    ],
  });

  it('prefers a constant Value over the item JSON', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({ inputs: valuedInputs(1200) }),
      inputItems: [{ json: { spend: 1, tier: 'gold', untouched: true } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 0.2, label: 'vip', untouched: true });
  });

  it('resolves Value expressions per item', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({
        inputs: (itemIndex: number) => valuedInputs(itemIndex === 0 ? 1200 : 5),
      }),
      inputItems: [{ json: { spend: 1, tier: 'gold' } }, { json: { spend: 1, tier: 'gold' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 0.2 });
    expect(result[0][1].json).toMatchObject({ discount: 0, label: 'none' });
  });

  it('falls back to the item JSON when Value is empty', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({ inputs: valuedInputs('') }),
      inputItems: [{ json: { spend: 700, tier: 'bronze' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 0.1, label: 'standard' });
  });

  it('applies falsy-but-set values instead of falling back', async () => {
    const params = manualDiscountParams({
      hitPolicy: 'FIRST',
      inputs: { definitions: [{ name: 'active', type: 'boolean', value: false }] },
      outputs: { definitions: [{ name: 'band', type: 'string' }] },
      rules: {
        entries: [
          {
            inputEntries: { values: [{ inputName: 'active', expression: 'false' }] },
            outputEntries: { values: [{ outputName: 'band', value: '"off"' }] },
          },
        ],
      },
      defaultOutputs: defaultOutputEntries({ band: 'on' }),
    });
    const { result } = await executeWith({
      params,
      inputItems: [{ json: { active: true } }],
    });
    expect(result[0][0].json).toMatchObject({ band: 'off' });
  });

  it('matches numeric strings from Value constants numerically', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({ inputs: valuedInputs('1200') }),
      inputItems: [{ json: { spend: 1, tier: 'gold' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 0.2 });
  });

  it('merges outputs onto the original item, not reshaped values', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({
        inputs: valuedInputs(1200),
        outputMode: 'single',
        resultKey: 'band',
      }),
      inputItems: [{ json: { spend: 1, tier: 'gold' } }],
    });
    expect(result[0][0].json).toMatchObject({ spend: 1, band: { discount: 0.2 } });
    expect(result[0][0].json).not.toHaveProperty('discount');
  });
});

describe('DmnDecisionTable node (default output entries)', () => {
  it('accepts bare string values matching the declared type', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({
        defaultOutputs: {
          definitions: [
            { outputName: 'discount', value: '0' },
            { outputName: 'label', value: 'none' },
          ],
        },
      }),
      inputItems: [{ json: { spend: 1, tier: 'bronze' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 0, label: 'none' });
  });

  it('rejects entries referencing unknown outputs', async () => {
    await expect(
      executeWith({
        params: manualDiscountParams({
          defaultOutputs: { definitions: [{ outputName: 'nope', value: '0' }] },
        }),
        inputItems: [{ json: { spend: 1, tier: 'bronze' } }],
      }),
    ).rejects.toThrow(/references unknown output "nope"/);
  });

  it('rejects duplicate entries for the same output', async () => {
    await expect(
      executeWith({
        params: manualDiscountParams({
          defaultOutputs: {
            definitions: [
              { outputName: 'label', value: '"a"' },
              { outputName: 'label', value: '"b"' },
            ],
          },
        }),
        inputItems: [{ json: { spend: 1, tier: 'bronze' } }],
      }),
    ).rejects.toThrow(/Duplicate default output entry for output "label"/);
  });

  it('rejects values violating the declared output type', async () => {
    await expect(
      executeWith({
        params: manualDiscountParams({
          defaultOutputs: { definitions: [{ outputName: 'discount', value: '"oops"' }] },
        }),
        inputItems: [{ json: { spend: 1, tier: 'bronze' } }],
      }),
    ).rejects.toThrow(/must be a number/);
  });

  it('falls back to the JSON default on manual tables without entries', async () => {
    const { result } = await executeWith({
      params: {
        ...manualDiscountParams(),
        defaultOutputs: {},
        defaultOutput: { discount: 99, label: 'carried' },
      },
      inputItems: [{ json: { spend: 1, tier: 'bronze' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 99, label: 'carried' });
  });

  it('prefers entries over the JSON default on manual tables', async () => {
    const { result } = await executeWith({
      params: {
        ...manualDiscountParams(),
        defaultOutput: { discount: 99, label: 'stale' },
      },
      inputItems: [{ json: { spend: 1, tier: 'bronze' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 0, label: 'none' });
  });

  it('resolves entry values per item', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({
        defaultOutputs: (itemIndex: number) => ({
          definitions: [{ outputName: 'label', value: itemIndex === 0 ? '"first"' : '"second"' }],
        }),
      }),
      inputItems: [{ json: { spend: 1, tier: 'bronze' } }, { json: { spend: 2, tier: 'bronze' } }],
    });
    expect(result[0][0].json).toMatchObject({ label: 'first' });
    expect(result[0][1].json).toMatchObject({ label: 'second' });
  });
});

describe('DmnDecisionTable node (envelope output mode)', () => {
  it('nests the whole envelope under Result Key', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({ outputMode: 'envelope', resultKey: 'band', tableVersion: 'v1.2' }),
      inputItems: [{ json: { spend: 1200, tier: 'gold', extra: 'kept' } }],
    });
    expect(result[0][0].json).toMatchObject({
      spend: 1200,
      tier: 'gold',
      extra: 'kept',
      band: {
        decisionId: 'discountBand',
        tableVersion: 'v1.2',
        data: { discount: 0.2, label: 'vip' },
      },
    });
  });

  it('keeps item fields and default output without metadata set', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({ outputMode: 'envelope', resultKey: 'band', decisionId: '', tableVersion: '' }),
      inputItems: [{ json: { spend: 1, tier: 'bronze' } }],
    });
    expect(result[0][0].json).toMatchObject({
      spend: 1,
      band: { data: { discount: 0, label: 'none' } },
    });
    expect(result[0][0].json.band.decisionId).toBeUndefined();
    expect(result[0][0].json.band.tableVersion).toBeUndefined();
  });

  it('carries nulled outputs inside the envelope', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({ outputMode: 'envelope', resultKey: 'band', noMatchBehavior: 'null' }),
      inputItems: [{ json: { spend: 1, tier: 'bronze' } }],
    });
    expect(result[0][0].json).toMatchObject({ band: { data: { discount: null, label: null } } });
  });
});

describe('DmnDecisionTable node (empty result key merges)', () => {
  it('merges in single mode when Result Key is empty', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({ outputMode: 'single', resultKey: '' }),
      inputItems: [{ json: { spend: 1200, tier: 'gold' } }],
    });
    expect(result[0][0].json).toMatchObject({ spend: 1200, discount: 0.2, label: 'vip' });
    expect(result[0][0].json).not.toHaveProperty('band');
  });

  it('merges in envelope mode when Result Key is empty', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({ outputMode: 'envelope', resultKey: '   ' }),
      inputItems: [{ json: { spend: 1200, tier: 'gold' } }],
    });
    expect(result[0][0].json).toMatchObject({ spend: 1200, discount: 0.2 });
    expect(result[0][0].json).not.toHaveProperty('data');
  });

  it('ignores an unsafe key in merge mode instead of throwing', async () => {
    const { result } = await executeWith({
      params: manualDiscountParams({ outputMode: 'merge', resultKey: '__proto__' }),
      inputItems: [{ json: { spend: 1200, tier: 'gold' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 0.2 });
  });

  it('still rejects an unsafe key when it would be used', async () => {
    await expect(
      executeWith({
        params: manualDiscountParams({ outputMode: 'envelope', resultKey: '__proto__' }),
        inputItems: [{ json: { spend: 1200, tier: 'gold' } }],
      }),
    ).rejects.toThrow(/Invalid Result Key/);
  });
});

describe('DmnDecisionTable node description', () => {
  it('declares expected identity and transform grouping', () => {
    const node = new DmnDecisionTable();
    expect(node.description.name).toBe('dmnDecisionTable');
    expect(node.description.group).toContain('transform');
    expect(node.description.version).toBe(1);
  });
});
