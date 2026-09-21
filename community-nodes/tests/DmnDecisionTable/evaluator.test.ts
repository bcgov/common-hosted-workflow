import { describe, expect, it } from 'vitest';
import { evaluate, parseOutputLiteral } from '../../nodes/DmnDecisionTable/shared/evaluator';
import type { DecisionTable, PrimitiveType } from '../../nodes/DmnDecisionTable/shared/types';
import { discountBandTable, shippingTable } from './fixtures';

describe('evaluate FIRST', () => {
  it('returns the first matching rule in order', () => {
    const table = discountBandTable();
    const hit = evaluate(table, { spend: 1200, tier: 'gold' });
    expect(hit.matchedRuleIndexes).toEqual([0]);
    expect(hit.output).toEqual({ discount: 0.2, label: 'vip' });
  });

  it('skips non-matching earlier rules', () => {
    const table = discountBandTable();
    const hit = evaluate(table, { spend: 600, tier: 'bronze' });
    expect(hit.matchedRuleIndexes).toEqual([1]);
    expect(hit.output).toEqual({ discount: 0.1, label: 'standard' });
  });

  it('matches list cells', () => {
    const table = discountBandTable();
    const hit = evaluate(table, { spend: 100, tier: 'silver' });
    expect(hit.matchedRuleIndexes).toEqual([2]);
    expect(hit.output).toEqual({ discount: 0.05, label: 'member' });
  });

  it('falls back to defaultOutput when nothing matches', () => {
    const table = discountBandTable();
    const hit = evaluate(table, { spend: 10, tier: 'bronze' });
    expect(hit.matchedRuleIndexes).toEqual([]);
    expect(hit.output).toEqual({ discount: 0, label: 'none' });
  });

  it('evaluates ranges, dates and negation', () => {
    const table = shippingTable();
    expect(evaluate(table, { weight: 3, shippedOn: '2026-05-01', region: 'urban' }).output).toEqual({ fee: 5 });
    expect(evaluate(table, { weight: 10, shippedOn: '2020-01-01', region: 'remote' }).output).toEqual({ fee: 12 });
    expect(evaluate(table, { weight: 99, shippedOn: '2026-05-01', region: 'urban' }).output).toEqual({ fee: 25 });
  });
});

describe('evaluate hit policies', () => {
  const overlapping = (): DecisionTable => ({
    hitPolicy: 'UNIQUE',
    inputs: [{ name: 'x', type: 'number' }],
    outputs: [{ name: 'out', type: 'string' }],
    rules: [
      { inputEntries: [{ inputName: 'x', expression: '>0' }], outputEntries: [{ outputName: 'out', value: '"pos"' }] },
      { inputEntries: [{ inputName: 'x', expression: '>5' }], outputEntries: [{ outputName: 'out', value: '"big"' }] },
    ],
  });

  it('UNIQUE throws on multiple hits', () => {
    expect(() => evaluate(overlapping(), { x: 10 })).toThrow(/UNIQUE hit policy violated/);
    expect(evaluate(overlapping(), { x: 3 }).output).toEqual({ out: 'pos' });
  });

  it('ANY accepts agreeing hits and rejects disagreeing ones', () => {
    const agreeing: DecisionTable = {
      ...overlapping(),
      hitPolicy: 'ANY',
      rules: [
        {
          inputEntries: [{ inputName: 'x', expression: '>0' }],
          outputEntries: [{ outputName: 'out', value: '"pos"' }],
        },
        { inputEntries: [{ inputName: 'x', expression: '' }], outputEntries: [{ outputName: 'out', value: '"pos"' }] },
      ],
    };
    expect(evaluate(agreeing, { x: 3 }).output).toEqual({ out: 'pos' });
    expect(() => evaluate({ ...overlapping(), hitPolicy: 'ANY' }, { x: 10 })).toThrow(/ANY hit policy violated/);
  });

  it('COLLECT and RULE ORDER gather all hits in order', () => {
    for (const hitPolicy of ['COLLECT', 'RULE ORDER'] as const) {
      const result = evaluate({ ...overlapping(), hitPolicy }, { x: 10 });
      expect(result.matchedRuleIndexes).toEqual([0, 1]);
      expect(result.output).toEqual({ out: ['pos', 'big'] });
    }
  });

  it('PRIORITY returns the first hit', () => {
    const result = evaluate({ ...overlapping(), hitPolicy: 'PRIORITY' }, { x: 10 });
    expect(result.matchedRuleIndexes).toEqual([0]);
    expect(result.output).toEqual({ out: 'pos' });
  });
});

describe('evaluate validation', () => {
  it('rejects unknown input references', () => {
    const table = discountBandTable();
    table.rules[0].inputEntries[0].inputName = 'nope';
    expect(() => evaluate(table, { spend: 1, tier: 'x' })).toThrow(/unknown input/);
  });

  it('rejects duplicate and unsafe names', () => {
    const table = discountBandTable();
    table.inputs[1].name = 'spend';
    expect(() => evaluate(table, {})).toThrow(/Duplicate input name/);
    table.inputs[1].name = '__proto__';
    expect(() => evaluate(table, {})).toThrow(/Invalid input name/);
  });

  it('rejects invalid output JSON literals', () => {
    const table = discountBandTable();
    table.rules[0].outputEntries[0].value = 'M';
    expect(() => evaluate(table, { spend: 1200, tier: 'gold' })).toThrow(/not a valid JSON literal/);
  });

  it('rejects defaultOutput keys outside the declared outputs', () => {
    const table = discountBandTable();
    table.defaultOutput = { discount: 0, label: 'none', typo: 1 };
    expect(() => evaluate(table, { spend: 1, tier: 'bronze' })).toThrow(/unknown output "typo"/);
  });

  it('rejects non-string rule descriptions', () => {
    const table = discountBandTable();
    (table.rules[0] as { description?: unknown }).description = 5;
    expect(() => evaluate(table, {})).toThrow(/description must be a string/);
  });

  it('ignores rule descriptions when matching', () => {
    const table = discountBandTable();
    table.rules[0].description = 'VIP band';
    expect(evaluate(table, { spend: 1200, tier: 'gold' }).output).toEqual({ discount: 0.2, label: 'vip' });
  });

  it('rejects null entries inside rules', () => {
    const table = discountBandTable();
    (table.rules[0].inputEntries as unknown[]).push(null);
    expect(() => evaluate(table, { spend: 1, tier: 'bronze' })).toThrow(/invalid input entry/);
  });
});

describe('parseOutputLiteral output types', () => {
  const typedTable = (type: PrimitiveType, value: string): DecisionTable => ({
    hitPolicy: 'FIRST',
    inputs: [{ name: 'x', type: 'number' }],
    outputs: [{ name: 'o', type }],
    rules: [
      {
        inputEntries: [{ inputName: 'x', expression: '' }],
        outputEntries: [{ outputName: 'o', value }],
      },
    ],
  });

  it('accepts bare text for string outputs, quoted or not', () => {
    expect(evaluate(typedTable('string', 'gold'), {}).output).toEqual({ o: 'gold' });
    expect(evaluate(typedTable('string', '"gold"'), {}).output).toEqual({ o: 'gold' });
  });

  it('rejects non-strings for string outputs', () => {
    expect(() => evaluate(typedTable('string', '5'), {})).toThrow(/must be a string/);
    expect(() => evaluate(typedTable('string', 'true'), {})).toThrow(/must be a string/);
  });

  it('accepts bare dates for date outputs', () => {
    expect(evaluate(typedTable('date', '2026-01-01'), {}).output).toEqual({ o: '2026-01-01' });
    expect(() => evaluate(typedTable('date', '5'), {})).toThrow(/must be a string/);
  });

  it('requires JSON numbers, booleans, and arrays for the rest', () => {
    expect(evaluate(typedTable('number', '5'), {}).output).toEqual({ o: 5 });
    expect(() => evaluate(typedTable('number', '"5"'), {})).toThrow(/must be a number/);
    expect(evaluate(typedTable('boolean', 'true'), {}).output).toEqual({ o: true });
    expect(() => evaluate(typedTable('boolean', '"true"'), {})).toThrow(/must be a boolean/);
    expect(evaluate(typedTable('list', '[1,2]'), {}).output).toEqual({ o: [1, 2] });
    expect(() => evaluate(typedTable('list', '5'), {})).toThrow(/must be an array/);
  });

  it('passes null through for any type and objects without an object type', () => {
    expect(evaluate(typedTable('number', 'null'), {}).output).toEqual({ o: null });
    expect(evaluate(typedTable('string', '{"a":1}'), {}).output).toEqual({ o: { a: 1 } });
  });

  it('keeps the legacy untyped behavior without a declared type', () => {
    expect(parseOutputLiteral('"gold"', 'o', 0)).toBe('gold');
    expect(parseOutputLiteral('5', 'o', 0)).toBe(5);
    expect(() => parseOutputLiteral('M', 'o', 0)).toThrow(/not a valid JSON literal/);
  });
});
