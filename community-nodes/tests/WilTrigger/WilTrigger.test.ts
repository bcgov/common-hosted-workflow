import { describe, expect, it } from 'vitest';
import type { IExecuteFunctions } from 'n8n-workflow';
import { WilTrigger } from '../../nodes/WilTrigger/WilTrigger.node';
import { buildSampleItem, readInputSchema, shapeInput } from '../../nodes/WilTrigger/helpers';

function ctx(params: Record<string, unknown>, items: Array<{ json: Record<string, unknown> }>) {
  return {
    getNodeParameter: (name: string, _i: number, fallback: unknown) => params[name] ?? fallback,
    getInputData: () => items,
    getNode: () => ({ name: 'WIL Trigger' }),
  } as unknown as IExecuteFunctions;
}

const run = (params: Record<string, unknown>, items: Array<{ json: Record<string, unknown> }>) =>
  new WilTrigger().execute.call(ctx(params, items));

describe('WilTrigger description', () => {
  const { description } = new WilTrigger();

  it('is a single-instance, input-less trigger', () => {
    expect(description.group).toEqual(['trigger']);
    expect(description.inputs).toEqual([]);
    expect(description.maxNodes).toBe(1);
  });

  it('defaults match the external-hooks parser', () => {
    const byName = Object.fromEntries(description.properties.map((p) => [p.name, p.default]));
    expect(byName).toMatchObject({
      acceptedSources: ['chefs-form', 'button'],
      inputSource: 'passthrough',
      respondMode: 'immediately',
      responseTimeoutSec: 30,
    });
  });
});

describe('WilTrigger.execute', () => {
  const item = { json: { source: 'wil', input: { amount: 5, extra: 'x' } } };

  it('passes input through when no schema is declared', async () => {
    const [[out]] = await run({}, [item]);
    expect(out.json.input).toEqual({ amount: 5, extra: 'x' });
  });

  it('adds missing declared fields as null and keeps extras', async () => {
    const [[out]] = await run(
      {
        inputSource: 'workflowInputs',
        workflowInputs: {
          values: [
            { name: 'amount', type: 'number' },
            { name: 'note', type: 'string' },
          ],
        },
      },
      [item],
    );
    expect(out.json.input).toEqual({ amount: 5, note: null, extra: 'x' });
  });

  it('emits a sample item for editor test runs', async () => {
    const [[out]] = await run({ displayLabel: 'Approve', inputSource: 'jsonExample', jsonExample: '{"id":"a"}' }, []);
    expect(out.json).toMatchObject({ source: 'wil', trigger: { name: 'Approve' }, input: { id: 'example' } });
  });
});

describe('helpers', () => {
  it('ignores unnamed fields and invalid JSON examples', () => {
    expect(readInputSchema('workflowInputs', { values: [{ name: ' ' }, { name: 'a' }] }, undefined)).toEqual([
      { name: 'a', type: 'string' },
    ]);
    expect(readInputSchema('jsonExample', undefined, '{')).toEqual([]);
    expect(readInputSchema('jsonExample', undefined, '[1]')).toEqual([]);
  });

  it('shapeInput tolerates non-object input', () => {
    expect(shapeInput([{ name: 'a', type: 'string' }], 'oops')).toEqual({ a: null });
  });

  it('buildSampleItem uses type-appropriate examples', () => {
    const { json } = buildSampleItem([{ name: 'n', type: 'number' }], 'L');
    expect((json.input as Record<string, unknown>).n).toBe(0);
  });
});
