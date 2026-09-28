import { describe, expect, it } from 'vitest';
import { executeWith } from './helpers';
import { matchesCell } from '../../nodes/DmnDecisionTable/shared/cell';
import { evaluate } from '../../nodes/DmnDecisionTable/shared/evaluator';
import { discountBandTable } from './fixtures';

describe('DMN literal syntax validation', () => {
  it('rejects unsupported non-equality operands', () => {
    expect(() => matchesCell(7, '!= foo(bar)')).toThrow(/Unsupported cell expression/);
  });

  const malformed = [
    ...['=', '==', '!=', '<>', '>', '<', '>=', '<='].map((operator) => `${operator} foo(bar)`),
    '> > 5',
    '= [1,2]',
    '!= {x: 1}',
    '>= 1 * 2',
    '<= "a" + "b"',
    '[foo(bar)..10]',
    '[1..foo(bar)]',
    '[>1..10]',
    '[1..[2,3]]',
    'date()',
    'time(foo(bar))',
    'date(2026, 1, 1)',
    'date("2026" + "-01-01")',
    'datetime(date("2026-01-01"))',
    'date and time(>5)',
    'time(["09:00"])',
    '!= date(foo(bar))',
    '> time(foo(bar))',
    '[date(foo(bar))..10]',
    '[1..time(foo(bar))]',
    '"a" "b"',
    "'a' 'b'",
  ];
  for (const wrap of [
    (text: string) => text,
    (text: string) => `not(${text})`,
    (text: string) => `7, ${text}`,
    (text: string) => `[7, ${text}]`,
    (text: string) => `not([7, ${text}])`,
  ]) {
    it.each(malformed.map(wrap))('rejects malformed syntax even behind a match or negation: %s', (expression) => {
      expect(() => matchesCell(7, expression)).toThrow(/Unsupported cell expression/);
    });
  }

  it.each([
    ['foo(bar)', '"foo(bar)"', true],
    ['foo(bar)', '= "foo(bar)"', true],
    ['foo(bar)', '!= "foo(bar)"', false],
    [7, '!= "foo(bar)"', true],
    [7, '> "foo(bar)"', false],
    [7, '["foo(bar)"..10]', false],
    [7, '[1.."foo(bar)"]', false],
    [7, 'not(> "foo(bar)")', true],
    ['café', 'café', true],
    ['日本語', '= 日本語', true],
    [5, '= 5', true],
    ['true', '= TRUE', true],
    ['false', '!= false', false],
    [null, '= null', true],
    [undefined, '<> null', false],
    [7, '!= null', true],
    ['2026-01-02', '> date("2026-01-01")', true],
    ['9:30', '> time("09:00")', true],
    ['2026-01-01T10:00', 'datetime("2026-01-01T10:00")', true],
    ['2026-01-01T10:00', 'date and time("2026-01-01T10:00")', true],
    ['2026-01-02', '[date("2026-01-01")..date("2026-12-31")]', true],
    ['9:30', '[time("09:00")..time("10:00")]', true],
    ['2026-01-01', 'date(2026-01-01)', true],
    ['9:30', '> time(09:00)', true],
    [7, '> plain-text', false],
    [7, '> time("25:00")', false],
    [7, '> 1e999', false],
    [7, '> time("09:00")', false],
    ['09:00', '> 7', false],
    ['2026-01-01', '[1..10]', false],
    [7, '[1..date("2026-01-01")]', false],
    [7, 'not(> time("09:00"))', true],
    ['a"b', '= "a\\"b"', true],
    ['foo(bar)', 'date("foo(bar)")', true],
    [7, '> date("foo(bar)")', false],
    [7, '[date("foo(bar)")..10]', false],
    [7, '!= date("foo(bar)")', true],
  ])('preserves literal/coercion behavior for %j against %s', (actual, expression, expected) => {
    expect(matchesCell(actual, expression as string)).toBe(expected);
  });
});

describe('DMN quoted range delimiters', () => {
  it('returns the reported nonmatch and its negation without throwing', () => {
    expect(matchesCell(7, '["a..b"..10]')).toBe(false);
    expect(matchesCell(7, 'not([1.."a..b"])')).toBe(true);
  });

  const quotedBounds = [
    '"a..b"',
    "'a..b'",
    '"a..b..c"',
    String.raw`"a\"..b"`,
    String.raw`'a\'..b'`,
    String.raw`"a\\..b"`,
    String.raw`'a\\..b'`,
    String.raw`"a..b\\"`,
    String.raw`'a..b\\'`,
    String.raw`"a\\\"..b"`,
    String.raw`'a\\\'..b'`,
    '"a..b, (c]"',
    '"a\'..b"',
    `'a"..b'`,
    'date("a..b")',
    "time('a..b')",
    'datetime("a..b")',
    String.raw`date and time("a\"..b")`,
    String.raw`TIME ( 'a..b\\' )`,
  ];
  it.each(quotedBounds)('accepts %s in either bound with every bracket variant', (bound) => {
    for (const [open, close] of [
      ['[', ']'],
      ['[', ')'],
      ['(', ']'],
      ['(', ')'],
    ]) {
      for (const inner of [`${bound}..10`, `1..${bound}`, `${bound}..${bound}`]) {
        const range = `${open}${inner}${close}`;
        expect(matchesCell(7, range)).toBe(false);
        expect(matchesCell(7, `not(${range})`)).toBe(true);
      }
    }
  });

  it.each([
    ['["a..b"..10], [1..10]', true],
    ['[1.."a..b"], >10', false],
    ['[7, ["a..b"..10]]', true],
    ['not([7, [1.."a..b"]])', false],
    ['[not([1.."a..b"]), >10]', true],
    ['not(["a..b"..10]), not([1..10])', true],
  ] as const)('composes ranges with lists and negation: %s', (expression, expected) => {
    expect(matchesCell(7, expression)).toBe(expected);
  });

  it.each([
    ['a..b', '["a..b"]'],
    ['a..b', '["a..b", "c"]'],
    ['a..b', '[date("a..b"), "c"]'],
    ['a"..b', String.raw`["a\"..b", "c"]`],
    ['a..b\\', String.raw`['a..b\\', 'c']`],
  ])('keeps quoted delimiter text as list data: %s against %s', (actual, expression) => {
    expect(matchesCell(actual, expression)).toBe(true);
  });

  it.each([
    ['[1..10]', true, true],
    ['[1..10)', true, false],
    ['(1..10]', false, true],
    ['(1..10)', false, false],
    ['["1".."10"]', true, true],
    ['[date(1)..time("10")]', true, true],
  ] as const)('preserves numeric endpoint inclusion: %s', (expression, lower, upper) => {
    expect(matchesCell(1, expression)).toBe(lower);
    expect(matchesCell(10, expression)).toBe(upper);
    expect(matchesCell(7, expression)).toBe(true);
    expect(matchesCell(11, expression)).toBe(false);
  });

  it('preserves decimal bounds and temporal constructor ranges', () => {
    expect(matchesCell(0.5, '[ -1.5 .. 1.25 )')).toBe(true);
    expect(matchesCell('2026-06-01', '[date(2026-01-01)..date("2026-12-31")]')).toBe(true);
    expect(matchesCell('09:30', '(time("09:00")..time(10:00)]')).toBe(true);
    expect(matchesCell('2026-01-01T12:00', '[datetime("2026-01-01T00:00")..date and time("2026-01-02T00:00"))')).toBe(
      true,
    );
  });

  it.each([
    '[.."a..b"]',
    '["a..b"..]',
    '[ .. ]',
    '[1..2..3]',
    '[1....10]',
    '["a..b"..2..3]',
    '[1..2.."a..b"]',
    '[date("a..b")..2..time("c..d")]',
    '[date(a..b)..10]',
    '["a..b"..foo(bar)]',
    '[foo(bar).."a..b"]',
    '["a..b"..date(foo(bar))]',
    '[date("a..b", "c")..10]',
    '[datetime(date("a..b"))..10]',
    '["a..b" "c"..10]',
    '["a..b..10]',
    String.raw`["a..b\"..10]`,
    '[time("a..b")..10',
    '("a..b")',
  ])('rejects malformed ranges even behind a match or negation: %s', (range) => {
    for (const expression of [range, `not(${range})`, `7, ${range}`, `[7, ${range}]`, `not([7, ${range}])`]) {
      expect(() => matchesCell(7, expression)).toThrow();
    }
  });
});

describe('DMN expression errors during evaluation', () => {
  const tableWithLaterError = (expression: string) => {
    const table = discountBandTable();
    table.rules[1].inputEntries[0].expression = expression;
    return table;
  };

  it.each(['!= foo(bar)', 'not(> foo(bar))', '7, [1..foo(bar)]', 'date(foo(bar))'])(
    'includes rule/input context for %s',
    (expression) => {
      expect(() => evaluate(tableWithLaterError(expression), { spend: 7 })).toThrow(
        /Rule 2 input "spend": Unsupported cell expression/,
      );
    },
  );

  it('FIRST skips later invalid input and output expressions', () => {
    const table = tableWithLaterError('!= foo(bar)');
    table.rules[1].outputEntries[0].value = 'not-json';
    expect(evaluate(table, { spend: 1200, tier: 'gold' })).toEqual({
      matchedRuleIndexes: [0],
      output: { discount: 0.2, label: 'vip' },
    });
  });

  it('continues after an expression failure and retains item pairing', async () => {
    const { result } = await executeWith({
      params: { tableSource: 'json', tableJson: tableWithLaterError('not(> foo(bar))') },
      inputItems: [{ json: { spend: 7 } }, { json: { spend: 1200, tier: 'gold' } }],
      continueOnFail: true,
    });
    expect(result[0]).toHaveLength(2);
    expect(result[0][0]).toEqual({
      json: { error: expect.stringMatching(/Rule 2 input "spend": Unsupported cell expression/) },
      pairedItem: { item: 0 },
    });
    expect(result[0][1]).toMatchObject({ json: { discount: 0.2, label: 'vip' }, pairedItem: { item: 1 } });
  });

  it('stops on expression failure without Continue On Fail', async () => {
    await expect(
      executeWith({
        params: { tableSource: 'json', tableJson: tableWithLaterError('!= foo(bar)') },
        inputItems: [{ json: { spend: 7 } }, { json: { spend: 1200, tier: 'gold' } }],
      }),
    ).rejects.toThrow(/Rule 2 input "spend": Unsupported cell expression/);
  });

  it('keeps rule-input short-circuiting and unmatched-output parsing lazy', () => {
    const table = discountBandTable();
    table.rules[0].inputEntries[1].expression = '!= foo(bar)';
    table.rules[0].outputEntries[0].value = 'not-json';
    expect(evaluate(table, { spend: 700 })).toEqual({
      matchedRuleIndexes: [1],
      output: { discount: 0.1, label: 'standard' },
    });
  });
});
