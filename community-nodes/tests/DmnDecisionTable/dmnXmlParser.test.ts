import { describe, expect, it } from 'vitest';
import { listDmnDecisions, parseDmnXml } from '../../nodes/DmnDecisionTable/shared/dmnXmlParser';
import { evaluate } from '../../nodes/DmnDecisionTable/shared/evaluator';
import { SAMPLE_DMN_XML } from './fixtures';

describe('parseDmnXml', () => {
  it('parses the first decision by default', () => {
    const table = parseDmnXml(SAMPLE_DMN_XML);
    expect(table.decisionId).toBe('discountBand');
    expect(table.hitPolicy).toBe('FIRST');
    expect(table.inputs.map((input) => input.name)).toEqual(['spend', 'tier']);
    expect(table.outputs.map((output) => output.name)).toEqual(['discount']);
    expect(table.rules).toHaveLength(2);
    expect(table.rules[0].inputEntries).toEqual([
      { inputName: 'spend', expression: '>= 1000' },
      { inputName: 'tier', expression: '"gold"' },
    ]);
  });

  it('selects a decision by id', () => {
    const table = parseDmnXml(SAMPLE_DMN_XML, 'other');
    expect(table.hitPolicy).toBe('UNIQUE');
    expect(table.inputs).toEqual([{ name: 'flag', type: 'string' }]);
  });

  it('evaluates a parsed table', () => {
    const table = parseDmnXml(SAMPLE_DMN_XML, 'discountBand');
    expect(evaluate(table, { spend: 2000, tier: 'gold' }).output).toEqual({ discount: 0.2 });
    expect(evaluate(table, { spend: 1, tier: 'x' }).output).toEqual({ discount: 0 });
  });

  it('lists decisions and errors on unknown ids', () => {
    expect(listDmnDecisions(SAMPLE_DMN_XML)).toEqual(['discountBand', 'other']);
    expect(() => parseDmnXml(SAMPLE_DMN_XML, 'missing')).toThrow(/not found/);
  });

  it('rejects empty, malformed and decision-less XML', () => {
    expect(() => parseDmnXml('')).toThrow(/must not be empty/);
    expect(() => parseDmnXml('<not-xml')).toThrow();
    expect(() =>
      parseDmnXml('<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"></definitions>'),
    ).toThrow(/no decision elements/);
  });

  it('rejects decisions without a decisionTable', () => {
    const xml = `<?xml version="1.0"?><definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"><decision id="lit"><literalExpression><text>1</text></literalExpression></decision></definitions>`;
    expect(() => parseDmnXml(xml, 'lit')).toThrow(/no decisionTable/);
  });
});
