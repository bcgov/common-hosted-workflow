import { describe, expect, it } from 'vitest';
import { matchesCell } from '../../nodes/DmnDecisionTable/shared/cell';
import { parseDmnXml } from '../../nodes/DmnDecisionTable/shared/dmnXmlParser';
import { evaluate } from '../../nodes/DmnDecisionTable/shared/evaluator';
import type { DecisionTable } from '../../nodes/DmnDecisionTable/shared/types';
import { SAMPLE_DMN_XML, NAMESPACED_DMN_XML, discountBandTable } from './fixtures';
import { defaultOutputEntries, executeWith, manualDiscountParams } from './helpers';

describe('review regressions: expression composition', () => {
  it.each([1, 4])('matches disjoint ranges for %s', (value) => {
    expect(matchesCell(value, '[1..2], [4..5]')).toBe(true);
  });
  it('combines two negated tests with OR', () => {
    expect(matchesCell('a', 'not("a"), not("b")')).toBe(true);
  });
  it.each(['= "a and b"', '["a and b", "c"]'])('allows quoted keywords in %s', (expression) => {
    expect(matchesCell('a and b', expression)).toBe(true);
  });
  it('allows date and time constructors as comparison operands', () => {
    expect(matchesCell('2026-02-01T00:00:00Z', '> date and time("2026-01-01T00:00:00Z")')).toBe(true);
  });
  it.each(['[1..]', '[..2]', '"x", foo(bar)', '"x", [1..'])('rejects invalid alternatives: %s', (expression) => {
    expect(() => matchesCell('x', expression)).toThrow();
  });
  it('bounds recursive expression nesting', () => {
    expect(() => matchesCell('x', 'not('.repeat(66) + '"x"' + ')'.repeat(66))).toThrow(/nesting limit/);
  });
});

describe('review regressions: evaluator', () => {
  it('continues ranking after two unranked first outputs', () => {
    const table: DecisionTable = {
      hitPolicy: 'PRIORITY',
      inputs: [{ name: 'x', type: 'number' }],
      outputs: [
        { name: 'note', type: 'string' },
        { name: 'grade', type: 'string' },
      ],
      outputPriorities: { grade: ['A', 'B'] },
      rules: ['B', 'A'].map((grade) => ({
        inputEntries: [],
        outputEntries: [
          { outputName: 'note', value: '"same"' },
          { outputName: 'grade', value: JSON.stringify(grade) },
        ],
      })),
    };
    expect(evaluate(table, {}).matchedRuleIndexes).toEqual([1]);
    expect(evaluate({ ...table, hitPolicy: 'OUTPUT ORDER' }, {}).matchedRuleIndexes).toEqual([1, 0]);
  });
  it('collects outputs whose names collide with Object.prototype', () => {
    const table: DecisionTable = {
      hitPolicy: 'COLLECT',
      inputs: [{ name: 'x', type: 'number' }],
      outputs: [{ name: 'toString', type: 'number' }],
      rules: [1, 2].map((value) => ({
        inputEntries: [],
        outputEntries: [{ outputName: 'toString', value: String(value) }],
      })),
    };
    expect(evaluate(table, {}).output).toEqual({ toString: [1, 2] });
  });
  it('does not read inherited input values', () => {
    expect(evaluate(discountBandTable(), Object.create({ spend: 1200, tier: 'gold' })).matchedRuleIndexes).toEqual([]);
  });
  it('FIRST does not evaluate later matching output expressions', () => {
    const table = discountBandTable();
    table.rules[1].outputEntries[0].value = 'not-json';
    expect(evaluate(table, { spend: 1200, tier: 'gold' }).output.discount).toBe(0.2);
  });
  it('rejects sparse output rows rather than losing result alignment', () => {
    const table = discountBandTable();
    table.rules[1].outputEntries.pop();
    expect(() => evaluate(table, {})).toThrow(/every declared output/);
  });
  it('rejects non-finite output literals and aggregate overflow', () => {
    const table: DecisionTable = {
      hitPolicy: 'COLLECT',
      aggregation: 'SUM',
      inputs: [{ name: 'x', type: 'number' }],
      outputs: [{ name: 'out', type: 'number' }],
      rules: [1, 2].map(() => ({ inputEntries: [], outputEntries: [{ outputName: 'out', value: '1e308' }] })),
    };
    expect(() => evaluate(table, {})).toThrow(/overflow/);
    table.rules[0].outputEntries[0].value = '1e999';
    expect(() => evaluate(table, {})).toThrow(/JSON literal/);
  });
  it('reports malformed declarations and defaults clearly', () => {
    const table = discountBandTable();
    (table.inputs as unknown[])[0] = null;
    expect(() => evaluate(table, {})).toThrow(/Invalid input declaration/);
    expect(() =>
      evaluate({ ...discountBandTable(), defaultOutput: [] as unknown as Record<string, unknown> }, {}),
    ).toThrow(/defaultOutput must be an object/);
  });
});

describe('review regressions: XML boundary', () => {
  it('uses the DMN default UNIQUE when hitPolicy is omitted', () => {
    const table = parseDmnXml(SAMPLE_DMN_XML.replace(' hitPolicy="FIRST"', ''));
    expect(table.hitPolicy).toBe('UNIQUE');
    expect(() => evaluate(table, { spend: 1200, tier: 'gold' })).toThrow(/UNIQUE/);
  });
  it('rejects mismatched XML closing tags', () => {
    expect(() => parseDmnXml(SAMPLE_DMN_XML.replace('</decisionTable>', '</wrong>'))).toThrow(/Invalid DMN XML/);
  });
  it('rejects missing positional cells rather than widening the rule', () => {
    expect(() => parseDmnXml(SAMPLE_DMN_XML.replace('<inputEntry><text>"gold"</text></inputEntry>', ''))).toThrow(
      /input entries/,
    );
  });
  it('rejects DOCTYPE declarations', () => {
    expect(() => parseDmnXml('<!DOCTYPE definitions [<!ENTITY x "value">]>' + SAMPLE_DMN_XML)).toThrow(/DOCTYPE/);
  });
  it('does not rename an explicitly unsafe output', () => {
    expect(() => parseDmnXml(SAMPLE_DMN_XML.replace('name="discount"', 'name="__proto__"'))).toThrow(
      /Invalid output name/,
    );
  });
  it('preserves input paths instead of substituting display labels', () => {
    const table = parseDmnXml(NAMESPACED_DMN_XML);
    expect(table.inputs[0].expression).toBe('applicant.age');
    expect(evaluate(table, { Age: 99, applicant: { age: 10 } }).matchedRuleIndexes).toEqual([]);
    expect(evaluate(table, { applicant: { age: 30 } }).output).toEqual({ band: 'adult' });
    expect(evaluate(table, { applicant: Object.create({ age: 30 }) }).matchedRuleIndexes).toEqual([]);
    const withoutLabel = parseDmnXml(NAMESPACED_DMN_XML.replace('label="Age"', ''));
    expect(evaluate(withoutLabel, { applicant: { age: 30 } }).output).toEqual({ band: 'adult' });
  });
  it.each(['applicant.age + 1', 'applicant.__proto__.age'])(
    'rejects unsupported input references: %s',
    (expression) => {
      expect(() => parseDmnXml(NAMESPACED_DMN_XML.replace('applicant.age', expression))).toThrow(
        /Unsupported input expression/,
      );
    },
  );
});

describe('review regressions: per-item defaults', () => {
  it('rejects malformed manual input entry lists instead of wildcarding', async () => {
    const params = manualDiscountParams();
    const rules = params.rules as { entries: Array<{ inputEntries: { values: unknown } }> };
    rules.entries[0].inputEntries.values = {};
    await expect(executeWith({ params })).rejects.toThrow(/must be an array/);
  });
  it.each(['manual', 'dmnXml'])('does not leak item zero defaults for %s tables', async (tableSource) => {
    // Each source reads its own default parameter; the other key is ignored.
    const sourceDefault =
      tableSource === 'manual'
        ? { defaultOutputs: (index: number) => (index === 0 ? defaultOutputEntries({ discount: 99 }) : {}) }
        : { defaultOutput: (index: number) => (index === 0 ? { discount: 99 } : {}) };
    const { result } = await executeWith({
      params: {
        ...manualDiscountParams(),
        tableSource,
        decisionId: 'discountBand',
        dmnXml: SAMPLE_DMN_XML.replace(
          '<inputEntry><text></text></inputEntry>',
          '<inputEntry><text>&gt;9999</text></inputEntry>',
        ),
        ...sourceDefault,
      },
      inputItems: [{ json: { spend: 1, tier: 'bronze' } }, { json: { spend: 1, tier: 'bronze' } }],
    });
    expect(result[0][0].json.discount).toBe(99);
    expect(result[0][1].json).not.toHaveProperty('discount');
  });
});
