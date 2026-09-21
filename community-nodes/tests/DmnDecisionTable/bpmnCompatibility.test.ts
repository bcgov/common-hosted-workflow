import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { matchesCell } from '../../nodes/DmnDecisionTable/shared/cell';
import { listDmnDecisions, parseDmnXml } from '../../nodes/DmnDecisionTable/shared/dmnXmlParser';
import { evaluate } from '../../nodes/DmnDecisionTable/shared/evaluator';
import type { DecisionTable } from '../../nodes/DmnDecisionTable/shared/types';
import { COLLECT_SUM_DMN_XML, NAMESPACED_DMN_XML, PRIORITY_DMN_XML } from './fixtures';
import { defaultOutputEntries, executeWith, manualDiscountParams } from './helpers';

function livingCategoryXml(): string {
  return readFileSync(new URL('./living-category.dmn.xml', import.meta.url), 'utf8');
}

describe('BPMN compatibility: living-category decision (Camunda-style export)', () => {
  it('parses inputs, outputs and rules from tool-generated XML', () => {
    const table = parseDmnXml(livingCategoryXml(), 'dmnFullTimeLivingCategory');
    expect(table.hitPolicy).toBe('FIRST');
    expect(table.inputs.map((input) => input.name)).toEqual([
      'studentDataRelationshipStatus',
      'studentDataDependantstatus',
      'calculatedDataTotalEligibleDependants',
      'studentDataLivingAtHome',
      'studentDataSelfContainedSuite',
    ]);
    expect(table.outputs.map((output) => output.name)).toEqual(['calculatedDataLivingCategory']);
    expect(table.rules).toHaveLength(8);
  });

  it('evaluates representative living-category cases', () => {
    const table = parseDmnXml(livingCategoryXml(), 'dmnFullTimeLivingCategory');
    // MARRIED STUDENT & SPOUSE (no dependent considered)
    expect(evaluate(table, { studentDataRelationshipStatus: 'married' }).output).toEqual({
      calculatedDataLivingCategory: 'M',
    });
    // SINGLE PARENT: single-ish + independant + dependants > 0
    expect(
      evaluate(table, {
        studentDataRelationshipStatus: 'single',
        studentDataDependantstatus: 'independant',
        calculatedDataTotalEligibleDependants: 2,
      }).output,
    ).toEqual({ calculatedDataLivingCategory: 'SP' });
    // SINGLE INDEPENDANT AWAY FROM HOME
    expect(
      evaluate(table, {
        studentDataRelationshipStatus: 'other',
        studentDataDependantstatus: 'independant',
        studentDataLivingAtHome: 'no',
      }).output,
    ).toEqual({ calculatedDataLivingCategory: 'SIA' });
    // SINGLE INDEPENDANT AT HOME
    expect(
      evaluate(table, {
        studentDataRelationshipStatus: 'marriedUnable',
        studentDataDependantstatus: 'independant',
        studentDataLivingAtHome: 'yes',
        studentDataSelfContainedSuite: 'no',
      }).output,
    ).toEqual({ calculatedDataLivingCategory: 'SIH' });
    // SINGLE DEPENDANT AWAY: '-' wildcard on dependant count
    expect(
      evaluate(table, {
        studentDataRelationshipStatus: 'single',
        studentDataDependantstatus: 'dependant',
        studentDataLivingAtHome: 'no',
      }).output,
    ).toEqual({ calculatedDataLivingCategory: 'SDA' });
    // SINGLE DEPENDANT AT HOME
    expect(
      evaluate(table, {
        studentDataRelationshipStatus: 'other',
        studentDataDependantstatus: 'dependant',
        studentDataLivingAtHome: 'yes',
        studentDataSelfContainedSuite: 'no',
      }).output,
    ).toEqual({ calculatedDataLivingCategory: 'SDH' });
  });

  it('runs end to end through the node from DMN XML', async () => {
    const { result } = await executeWith({
      params: {
        tableSource: 'dmnXml',
        decisionId: 'dmnFullTimeLivingCategory',
        dmnXml: livingCategoryXml(),
        defaultOutput: { calculatedDataLivingCategory: 'UNKNOWN' },
        noMatchBehavior: 'default',
        outputMode: 'merge',
      },
      inputItems: [{ json: { studentDataRelationshipStatus: 'married' } }],
    });
    expect(result[0][0].json).toMatchObject({ calculatedDataLivingCategory: 'M' });
  });
});

describe('BPMN compatibility: namespaced exports, labels and FEEL types', () => {
  it('parses dmn:-prefixed documents', () => {
    const table = parseDmnXml(NAMESPACED_DMN_XML, 'adultCheck');
    expect(table.inputs.map((input) => input.name)).toEqual(['Age', 'memberSince']);
    expect(table.inputs.map((input) => input.type)).toEqual(['number', 'date']);
    expect(table.outputs).toEqual([{ name: 'band', type: 'string' }]);
    expect(listDmnDecisions(NAMESPACED_DMN_XML)).toEqual(['adultCheck']);
  });

  it('evaluates FEEL date() constructors in cells', () => {
    const table = parseDmnXml(NAMESPACED_DMN_XML, 'adultCheck');
    expect(evaluate(table, { applicant: { age: 30 }, memberSince: '2019-06-01' }).output).toEqual({ band: 'senior' });
    expect(evaluate(table, { applicant: { age: 30 }, memberSince: '2021-06-01' }).output).toEqual({ band: 'adult' });
    expect(evaluate(table, { applicant: { age: 10 }, memberSince: '2019-06-01' }).output).toEqual({});
  });

  it('supports date()/time()/datetime() wrappers in cell expressions', () => {
    expect(matchesCell('2026-03-01', 'date("2026-01-01")')).toBe(false);
    expect(matchesCell('2026-03-01', '>= date("2026-01-01")')).toBe(true);
    expect(matchesCell('2026-03-01', '>= date("2026-05-01")')).toBe(false);
    expect(matchesCell('10:30', 'time("10:30")')).toBe(true);
    expect(matchesCell('2026-03-01', '[date("2026-01-01")..date("2026-12-31")]')).toBe(true);
  });

  it('compares time-only values chronologically', () => {
    expect(matchesCell('10:30', '> time("09:00")')).toBe(true);
    expect(matchesCell('08:59', '> time("09:00")')).toBe(false);
    expect(matchesCell('10:30', '["09:00".. "17:00"]')).toBe(true);
    expect(matchesCell('18:00', '["09:00".. "17:00"]')).toBe(false);
    expect(matchesCell('10:30:15', '>= time("10:30:00")')).toBe(true);
    // Malformed times stay incomparable (no match, no throw).
    expect(matchesCell('10:30', '> "not-a-time"')).toBe(false);
    expect(matchesCell('25:00', '> time("09:00")')).toBe(false);
  });

  it('evaluates each list option as a full unary test', () => {
    expect(matchesCell(7, '>5, <1')).toBe(true);
    expect(matchesCell(0, '>5, <1')).toBe(true);
    expect(matchesCell(3, '>5, <1')).toBe(false);
    expect(matchesCell('urban', 'not("remote"),"rural"')).toBe(true);
    expect(matchesCell('remote', 'not("remote"),"rural"')).toBe(false);
    expect(matchesCell(7, '[1..5], "7"')).toBe(true);
    // Bracket-quoted literals still match literally …
    expect(matchesCell('(', '[(]')).toBe(true);
    expect(matchesCell('x', '[(]')).toBe(false);
    // … while malformed known constructs stay loud.
    expect(() => matchesCell(5, '[1..2..3], "x"')).toThrow(/Invalid range/);
  });

  it('prefers output labels and usable raw names over positional fallbacks', () => {
    const xml = `<?xml version="1.0"?><definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"><decision id="d"><decisionTable hitPolicy="FIRST"><input label="Shift Start"><inputExpression><text>shift.start</text></inputExpression></input><input><inputExpression label="Crew"><text>crew</text></inputExpression></input><output label="Band" typeRef="string" /><rule><inputEntry><text>&gt; time("09:00")</text></inputEntry><inputEntry><text>"day"</text></inputEntry><outputEntry><text>"morning"</text></outputEntry></rule></decisionTable></decision></definitions>`;
    const table = parseDmnXml(xml, 'd');
    // Labels identify columns; the preserved expression reads the actual input.
    expect(table.inputs.map((input) => input.name)).toEqual(['Shift Start', 'crew']);
    // Missing output name falls back to the display label.
    expect(table.outputs.map((output) => output.name)).toEqual(['Band']);
    expect(evaluate(table, { shift: { start: '10:00' }, crew: 'day' }).output).toEqual({ Band: 'morning' });
  });
});

describe('BPMN compatibility: PRIORITY and OUTPUT ORDER', () => {
  it('selects the highest-priority hit, not the first rule', () => {
    const table = parseDmnXml(PRIORITY_DMN_XML, 'grading');
    expect(table.outputPriorities).toEqual({ grade: ['A', 'B', 'C'] });
    // Both rules match; "A" outranks "C" even though its rule comes second.
    const hit = evaluate(table, { score: 90 });
    expect(hit.matchedRuleIndexes).toEqual([1]);
    expect(hit.output).toEqual({ grade: 'A' });
    expect(evaluate(table, { score: 50 }).output).toEqual({ grade: 'C' });
  });

  it('orders OUTPUT ORDER hits by output priority', () => {
    const table = parseDmnXml(PRIORITY_DMN_XML, 'grading');
    const ordered: DecisionTable = { ...table, hitPolicy: 'OUTPUT ORDER' };
    const hit = evaluate(ordered, { score: 90 });
    expect(hit.matchedRuleIndexes).toEqual([1, 0]);
    expect(hit.output).toEqual({ grade: ['A', 'C'] });
  });

  it('degrades PRIORITY to first-hit-wins without outputValues', () => {
    const table = parseDmnXml(PRIORITY_DMN_XML, 'grading');
    const withoutPriorities: DecisionTable = { ...table, outputPriorities: undefined };
    const hit = evaluate(withoutPriorities, { score: 90 });
    expect(hit.matchedRuleIndexes).toEqual([0]);
    expect(hit.output).toEqual({ grade: 'C' });
  });
});

describe('BPMN compatibility: COLLECT aggregations', () => {
  it('parses the DMN aggregation attribute', () => {
    expect(parseDmnXml(COLLECT_SUM_DMN_XML, 'bonus').aggregation).toBe('SUM');
  });

  it('sums collected outputs', () => {
    const table = parseDmnXml(COLLECT_SUM_DMN_XML, 'bonus');
    const hit = evaluate(table, { years: 10 });
    expect(hit.matchedRuleIndexes).toEqual([0, 1]);
    expect(hit.output).toEqual({ points: 35 });
  });

  it('supports COUNT, MIN and MAX', () => {
    const base: DecisionTable = {
      hitPolicy: 'COLLECT',
      inputs: [{ name: 'x', type: 'number' }],
      outputs: [{ name: 'o', type: 'number' }],
      rules: [
        { inputEntries: [{ inputName: 'x', expression: '>0' }], outputEntries: [{ outputName: 'o', value: '5' }] },
        { inputEntries: [{ inputName: 'x', expression: '>2' }], outputEntries: [{ outputName: 'o', value: '9' }] },
      ],
    };
    expect(evaluate({ ...base, aggregation: 'COUNT' }, { x: 3 }).output).toEqual({ o: 2 });
    expect(evaluate({ ...base, aggregation: 'MIN' }, { x: 3 }).output).toEqual({ o: 5 });
    expect(evaluate({ ...base, aggregation: 'MAX' }, { x: 3 }).output).toEqual({ o: 9 });
    expect(evaluate({ ...base, aggregation: 'NONE' }, { x: 3 }).output).toEqual({ o: [5, 9] });
  });

  it('rejects non-numeric SUM and unknown aggregations', () => {
    const table: DecisionTable = {
      hitPolicy: 'COLLECT',
      aggregation: 'SUM',
      inputs: [{ name: 'x', type: 'number' }],
      outputs: [{ name: 'o', type: 'string' }],
      rules: [
        { inputEntries: [{ inputName: 'x', expression: '>0' }], outputEntries: [{ outputName: 'o', value: '"a"' }] },
      ],
    };
    expect(() => evaluate(table, { x: 1 })).toThrow(/SUM requires numeric/);
    expect(() => parseDmnXml(COLLECT_SUM_DMN_XML.replace('aggregation="SUM"', 'aggregation="MEDIAN"'))).toThrow(
      /Unsupported COLLECT aggregation/,
    );
  });
});

describe('BPMN compatibility: evaluation correctness', () => {
  it('treats ANY outputs as equal regardless of entry order', () => {
    const table: DecisionTable = {
      hitPolicy: 'ANY',
      inputs: [{ name: 'x', type: 'number' }],
      outputs: [
        { name: 'a', type: 'string' },
        { name: 'b', type: 'string' },
      ],
      rules: [
        {
          inputEntries: [{ inputName: 'x', expression: '>0' }],
          outputEntries: [
            { outputName: 'a', value: '"1"' },
            { outputName: 'b', value: '"2"' },
          ],
        },
        {
          inputEntries: [{ inputName: 'x', expression: '' }],
          outputEntries: [
            { outputName: 'b', value: '"2"' },
            { outputName: 'a', value: '"1"' },
          ],
        },
      ],
    };
    expect(evaluate(table, { x: 1 }).output).toEqual({ a: '1', b: '2' });
  });

  it('rejects duplicate input and output entries within a rule', () => {
    const dupInput: DecisionTable = {
      hitPolicy: 'FIRST',
      inputs: [{ name: 'x', type: 'number' }],
      outputs: [{ name: 'o', type: 'string' }],
      rules: [
        {
          inputEntries: [
            { inputName: 'x', expression: '>0' },
            { inputName: 'x', expression: '<10' },
          ],
          outputEntries: [{ outputName: 'o', value: '"hit"' }],
        },
      ],
    };
    expect(() => evaluate(dupInput, { x: 5 })).toThrow(/duplicate entries for input/);
    const dupOutput: DecisionTable = {
      ...dupInput,
      rules: [
        {
          inputEntries: [{ inputName: 'x', expression: '>0' }],
          outputEntries: [
            { outputName: 'o', value: '"a"' },
            { outputName: 'o', value: '"b"' },
          ],
        },
      ],
    };
    expect(() => evaluate(dupOutput, { x: 5 })).toThrow(/duplicate entries for output/);
  });

  it('fails loudly on nested cell content instead of wildcarding', () => {
    const xml = `<?xml version="1.0"?><definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"><decision id="d"><decisionTable hitPolicy="FIRST"><input><inputExpression><text>x</text></inputExpression></input><output name="o" typeRef="string"/><rule><inputEntry><text><nested>5</nested></text></inputEntry><outputEntry><text>"hit"</text></outputEntry></rule></decisionTable></decision></definitions>`;
    expect(() => parseDmnXml(xml, 'd')).toThrow(/nested content/);
  });

  it('imports rule descriptions as builder annotations', () => {
    const table = parseDmnXml(livingCategoryXml(), 'dmnFullTimeLivingCategory');
    expect(table.rules[0].description).toBe('MARRIED STUDENT & SPOUSE (no dependent considered)');
    expect(table.rules[1].description).toBe('SINGLE PARENT (no dependent considered)');
  });

  it('rejects nested markup inside rule descriptions', () => {
    const xml = `<?xml version="1.0"?><definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"><decision id="d"><decisionTable hitPolicy="FIRST"><input><inputExpression><text>x</text></inputExpression></input><output name="o" typeRef="string"/><rule><description><b>note</b></description><inputEntry><text>-</text></inputEntry><outputEntry><text>"v"</text></outputEntry></rule></decisionTable></decision></definitions>`;
    expect(() => parseDmnXml(xml, 'd')).toThrow(/nested content/);
  });

  it('rejects rules with more cells than declared columns', () => {
    const xml = `<?xml version="1.0"?><definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"><decision id="d"><decisionTable hitPolicy="FIRST"><input><inputExpression><text>x</text></inputExpression></input><output name="o" typeRef="string"/><rule><inputEntry><text>1</text></inputEntry><inputEntry><text>2</text></inputEntry><outputEntry><text>"v"</text></outputEntry></rule></decisionTable></decision></definitions>`;
    expect(() => parseDmnXml(xml, 'd')).toThrow(/more input entries than declared inputs/);
  });

  it('rejects unquoted boolean logic even behind an operator', () => {
    expect(() => matchesCell('x', '= a and b')).toThrow(/Boolean logic/);
    // … but quoted lists containing those words still work literally.
    expect(matchesCell('a or b', '"a or b", "c"')).toBe(true);
    expect(matchesCell('c', '"a or b", "c"')).toBe(true);
    expect(matchesCell('d', '"a or b", "c"')).toBe(false);
  });
});

describe('BPMN compatibility: node behavior', () => {
  it('keeps a JSON table embedded defaultOutput when the node default is empty', async () => {
    const { result } = await executeWith({
      params: {
        tableSource: 'json',
        tableJson: {
          hitPolicy: 'FIRST',
          inputs: [{ name: 'x', type: 'number' }],
          outputs: [{ name: 'o', type: 'string' }],
          rules: [],
          defaultOutput: { o: 'from-table' },
        },
        defaultOutput: {},
        noMatchBehavior: 'default',
        outputMode: 'merge',
      },
      inputItems: [{ json: { x: 1 } }],
    });
    expect(result[0][0].json).toMatchObject({ o: 'from-table' });
  });

  it('falls back to fitting entries when the JSON default is empty', async () => {
    const { result } = await executeWith({
      params: {
        tableSource: 'json',
        tableJson: {
          hitPolicy: 'FIRST',
          inputs: [{ name: 'x', type: 'number' }],
          outputs: [{ name: 'o', type: 'string' }],
          rules: [],
          defaultOutput: { o: 'from-table' },
        },
        defaultOutput: {},
        defaultOutputs: defaultOutputEntries({ o: 'from-entries' }),
        noMatchBehavior: 'default',
        outputMode: 'merge',
      },
      inputItems: [{ json: { x: 1 } }],
    });
    expect(result[0][0].json).toMatchObject({ o: 'from-entries' });
  });

  it('skips stale entries that do not fit the JSON table', async () => {
    const { result } = await executeWith({
      params: {
        tableSource: 'json',
        tableJson: {
          hitPolicy: 'FIRST',
          inputs: [{ name: 'x', type: 'number' }],
          outputs: [{ name: 'o', type: 'string' }],
          rules: [],
          defaultOutput: { o: 'from-table' },
        },
        defaultOutput: {},
        defaultOutputs: defaultOutputEntries({ gone: 'stale' }),
        noMatchBehavior: 'default',
        outputMode: 'merge',
      },
      inputItems: [{ json: { x: 1 } }],
    });
    expect(result[0][0].json).toMatchObject({ o: 'from-table' });
  });

  it('lets an explicit node defaultOutput override the embedded one', async () => {
    const { result } = await executeWith({
      params: {
        tableSource: 'json',
        tableJson: {
          hitPolicy: 'FIRST',
          inputs: [{ name: 'x', type: 'number' }],
          outputs: [{ name: 'o', type: 'string' }],
          rules: [],
          defaultOutput: { o: 'from-table' },
        },
        defaultOutput: { o: 'from-node' },
        noMatchBehavior: 'default',
        outputMode: 'merge',
      },
      inputItems: [{ json: { x: 1 } }],
    });
    expect(result[0][0].json).toMatchObject({ o: 'from-node' });
  });

  it('rejects unsafe result keys', async () => {
    await expect(
      executeWith({
        params: { ...manualDiscountParams(), outputMode: 'single', resultKey: '__proto__' },
        inputItems: [{ json: { spend: 1200, tier: 'gold' } }],
      }),
    ).rejects.toThrow(/Invalid Result Key/);
  });

  it('resolves output parameters per item', async () => {
    const { result } = await executeWith({
      params: {
        ...manualDiscountParams(),
        outputMode: (itemIndex: number) => (itemIndex === 0 ? 'merge' : 'single'),
      },
      inputItems: [{ json: { spend: 1200, tier: 'gold' } }, { json: { spend: 1200, tier: 'gold' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 0.2 });
    expect(result[0][0].json).not.toHaveProperty('decision');
    expect(result[0][1].json).toMatchObject({ decision: { discount: 0.2 } });
  });

  it('evaluates manual COLLECT tables with aggregation', async () => {
    const { result } = await executeWith({
      params: {
        ...manualDiscountParams(),
        hitPolicy: 'COLLECT',
        collectAggregation: 'COUNT',
      },
      inputItems: [{ json: { spend: 1200, tier: 'gold' } }],
    });
    expect(result[0][0].json).toMatchObject({ discount: 2, label: 2 });
  });

  it('normalizes hand-written JSON hitPolicy/aggregation casing', async () => {
    const { result } = await executeWith({
      params: {
        tableSource: 'json',
        tableJson: {
          hitPolicy: 'collect',
          aggregation: 'sum',
          inputs: [{ name: 'x', type: 'number' }],
          outputs: [{ name: 'o', type: 'number' }],
          rules: [
            { inputEntries: [{ inputName: 'x', expression: '>0' }], outputEntries: [{ outputName: 'o', value: '5' }] },
            { inputEntries: [{ inputName: 'x', expression: '>2' }], outputEntries: [{ outputName: 'o', value: '9' }] },
          ],
        },
        noMatchBehavior: 'default',
        outputMode: 'merge',
      },
      inputItems: [{ json: { x: 3 } }],
    });
    expect(result[0][0].json).toMatchObject({ o: 14 });
  });

  it('resolves defaultOutput per item', async () => {
    const { result } = await executeWith({
      params: {
        tableSource: 'json',
        tableJson: {
          hitPolicy: 'FIRST',
          inputs: [{ name: 'x', type: 'number' }],
          outputs: [{ name: 'o', type: 'string' }],
          rules: [],
          defaultOutput: { o: 'from-table' },
        },
        defaultOutput: (itemIndex: number) => (itemIndex === 0 ? {} : { o: 'item-1' }),
        noMatchBehavior: 'default',
        outputMode: 'merge',
      },
      inputItems: [{ json: { x: 1 } }, { json: { x: 2 } }],
    });
    expect(result[0][0].json).toMatchObject({ o: 'from-table' });
    expect(result[0][1].json).toMatchObject({ o: 'item-1' });
  });

  it('maps DMN-style type names in hand-written JSON', async () => {
    const { result } = await executeWith({
      params: {
        tableSource: 'json',
        tableJson: {
          hitPolicy: 'FIRST',
          inputs: [
            { name: 'age', type: 'integer' },
            { name: 'member', type: 'feel:boolean' },
          ],
          outputs: [{ name: 'band', type: 'string' }],
          rules: [
            {
              inputEntries: [
                { inputName: 'age', expression: '>=18' },
                { inputName: 'member', expression: 'true' },
              ],
              outputEntries: [{ outputName: 'band', value: '"adult"' }],
            },
          ],
          defaultOutput: { band: 'minor' },
        },
        noMatchBehavior: 'default',
        outputMode: 'merge',
      },
      inputItems: [{ json: { age: 30, member: true } }, { json: { age: 10, member: false } }],
    });
    expect(result[0][0].json).toMatchObject({ band: 'adult' });
    expect(result[0][1].json).toMatchObject({ band: 'minor' });
  });

  it('fails loudly on malformed manual rows instead of TypeErrors', async () => {
    const params = manualDiscountParams();
    (params.rules as { entries: unknown[] }).entries = [null];
    await expect(executeWith({ params, inputItems: [{ json: {} }] })).rejects.toThrow(
      /must define at least one output entry/,
    );
  });

  it('fails loudly on non-array JSON inputs instead of TypeErrors', async () => {
    await expect(
      executeWith({
        params: {
          tableSource: 'json',
          tableJson: { hitPolicy: 'FIRST', inputs: {}, outputs: [], rules: [] },
          noMatchBehavior: 'default',
          outputMode: 'merge',
        },
        inputItems: [{ json: {} }],
      }),
    ).rejects.toThrow(/must declare at least one input/);
  });
});

describe('BPMN compatibility: JSON input values', () => {
  const valueParams = (inputs: unknown[], entries?: Array<{ inputName: string; expression: string }>) => ({
    tableSource: 'json',
    tableJson: {
      hitPolicy: 'FIRST',
      inputs,
      outputs: [{ name: 'band', type: 'string' }],
      rules: [
        {
          inputEntries: (
            entries ?? [
              { inputName: 'age', expression: '>=18' },
              { inputName: 'member', expression: 'true' },
            ]
          ).map((entry) => ({ ...entry })),
          outputEntries: [{ outputName: 'band', value: '"adult"' }],
        },
      ],
      defaultOutput: { band: 'minor' },
    },
    noMatchBehavior: 'default',
    outputMode: 'merge',
  });

  it('prefers static JSON values over the item JSON', async () => {
    const { result } = await executeWith({
      params: valueParams([
        { name: 'age', type: 'number', value: 30 },
        { name: 'member', type: 'boolean', value: true },
      ]),
      inputItems: [{ json: { age: 1, member: false, kept: true } }],
    });
    expect(result[0][0].json).toMatchObject({ band: 'adult', kept: true });
  });

  it('applies falsy JSON values instead of falling back', async () => {
    const { result } = await executeWith({
      params: valueParams([
        { name: 'age', type: 'number', value: 30 },
        { name: 'member', type: 'boolean', value: false },
      ]),
      inputItems: [{ json: { age: 30, member: true } }],
    });
    expect(result[0][0].json).toMatchObject({ band: 'minor' });
  });

  it('falls back to item lookup for missing JSON values', async () => {
    const { result } = await executeWith({
      params: valueParams([
        { name: 'age', type: 'number' },
        { name: 'member', type: 'boolean', value: null },
      ]),
      inputItems: [{ json: { age: 30, member: true } }],
    });
    expect(result[0][0].json).toMatchObject({ band: 'adult' });
  });

  it('lets a fixed value win over an expression path without mutating the item', async () => {
    const { result } = await executeWith({
      params: valueParams(
        [
          { name: 'Age', type: 'number', expression: 'applicant.age', value: 10 },
          { name: 'member', type: 'boolean', value: true },
        ],
        [
          { inputName: 'Age', expression: '>=18' },
          { inputName: 'member', expression: 'true' },
        ],
      ),
      inputItems: [{ json: { applicant: { age: 30 }, member: true } }],
    });
    expect(result[0][0].json).toMatchObject({ band: 'minor' });
    expect(result[0][0].json).toMatchObject({ applicant: { age: 30 } });
  });
});
