import { describe, expect, it } from 'vitest';
import { matchesCell } from '../../nodes/DmnDecisionTable/shared/cell';

describe('matchesCell wildcards', () => {
  it.each(['', '-', 'any', 'ANY', ' - '])('treats %s as wildcard', (expression) => {
    expect(matchesCell('anything', expression)).toBe(true);
    expect(matchesCell(null, expression)).toBe(true);
    expect(matchesCell(undefined, expression)).toBe(true);
  });
});

describe('matchesCell equality', () => {
  it('matches quoted strings exactly', () => {
    expect(matchesCell('married', '"married"')).toBe(true);
    expect(matchesCell('married', "'married'")).toBe(true);
    expect(matchesCell('single', '"married"')).toBe(false);
  });

  it('matches barewords case-sensitively', () => {
    expect(matchesCell('yes', 'yes')).toBe(true);
    expect(matchesCell('Yes', 'yes')).toBe(false);
  });

  it('matches booleans case-insensitively', () => {
    expect(matchesCell(true, 'true')).toBe(true);
    expect(matchesCell(false, 'FALSE')).toBe(true);
    expect(matchesCell(true, 'false')).toBe(false);
  });

  it('matches explicit null only for nullish input', () => {
    expect(matchesCell(null, 'null')).toBe(true);
    expect(matchesCell(undefined, 'null')).toBe(true);
    expect(matchesCell('', 'null')).toBe(false);
    expect(matchesCell('null', '"null"')).toBe(true);
  });

  it('matches numbers numerically', () => {
    expect(matchesCell(5, '5')).toBe(true);
    expect(matchesCell(5, '=5')).toBe(true);
    expect(matchesCell(5, '6')).toBe(false);
  });
});

describe('matchesCell comparisons', () => {
  it('compares numbers', () => {
    expect(matchesCell(10, '>5')).toBe(true);
    expect(matchesCell(5, '>=5')).toBe(true);
    expect(matchesCell(4, '<5')).toBe(true);
    expect(matchesCell(5, '<=5')).toBe(true);
    expect(matchesCell(5, '!=6')).toBe(true);
    expect(matchesCell(5, '<>5')).toBe(false);
    expect(matchesCell('abc', '>5')).toBe(false);
  });

  it('compares ISO dates', () => {
    expect(matchesCell('2026-03-01', '>=2026-01-01')).toBe(true);
    expect(matchesCell('2025-12-31', '>=2026-01-01')).toBe(false);
  });
});

describe('matchesCell ranges', () => {
  it('handles inclusive and exclusive bounds', () => {
    expect(matchesCell(0, '[0..5]')).toBe(true);
    expect(matchesCell(5, '[0..5]')).toBe(true);
    expect(matchesCell(5, '(0..5)')).toBe(false);
    expect(matchesCell(0, '(0..5]')).toBe(false);
    expect(matchesCell(20, '(5..20]')).toBe(true);
    expect(matchesCell(21, '(5..20]')).toBe(false);
  });

  it('handles date ranges', () => {
    expect(matchesCell('2026-06-15', '[2026-01-01..2026-12-31]')).toBe(true);
    expect(matchesCell('2027-01-01', '[2026-01-01..2026-12-31]')).toBe(false);
  });

  it('treats single bracketed values as one-element lists', () => {
    expect(matchesCell(1, '[1]')).toBe(true);
    expect(matchesCell(5, '[1]')).toBe(false);
    expect(matchesCell('(', '[(]')).toBe(true);
  });

  it('rejects malformed ranges', () => {
    expect(() => matchesCell(5, '[1..')).toThrow();
    expect(() => matchesCell(5, '(5')).toThrow();
    expect(() => matchesCell(5, '[1..2..3]')).toThrow();
  });
});

describe('matchesCell lists', () => {
  it('matches membership with quoted or bare options', () => {
    expect(matchesCell('gold', '"gold","silver"')).toBe(true);
    expect(matchesCell('silver', '["gold", "silver"]')).toBe(true);
    expect(matchesCell('bronze', '"gold","silver"')).toBe(false);
  });

  it('respects quotes inside lists with commas', () => {
    expect(matchesCell('a,b', '"a,b","c"')).toBe(true);
    expect(matchesCell('b', '"a,b","c"')).toBe(false);
  });
});

describe('matchesCell negation', () => {
  it('negates inner expressions', () => {
    expect(matchesCell('remote', 'not("remote")')).toBe(false);
    expect(matchesCell('urban', 'not("remote")')).toBe(true);
    expect(matchesCell(3, 'not(>5)')).toBe(true);
    expect(matchesCell(7, 'not(>5)')).toBe(false);
  });

  it('rejects empty not()', () => {
    expect(() => matchesCell('x', 'not()')).toThrow();
  });
});

describe('matchesCell unsupported input', () => {
  it('throws instead of silently coercing', () => {
    expect(() => matchesCell('x', 'foo(bar)')).toThrow(/Unsupported cell expression/);
    expect(() => matchesCell('x', '>=')).toThrow();
  });
});

describe('matchesCell boolean strings', () => {
  it("matches webhook-style 'true'/'false' strings against boolean cells", () => {
    expect(matchesCell('true', 'true')).toBe(true);
    expect(matchesCell('FALSE', 'false')).toBe(true);
    expect(matchesCell('yes', 'true')).toBe(false);
    expect(matchesCell('true', '!=false')).toBe(true);
    expect(matchesCell('false', '!=false')).toBe(false);
  });
});

describe('matchesCell comparison domains', () => {
  it('never compares across number/time/date domains', () => {
    expect(matchesCell('10:30', '>5')).toBe(false);
    expect(matchesCell('2026-01-01', '>5')).toBe(false);
    expect(matchesCell(5, '> time("01:00")')).toBe(false);
    expect(matchesCell('10:30', '>2026-01-01')).toBe(false);
  });

  it('supports single-digit hours in time-only values', () => {
    expect(matchesCell('9:00', '> time("08:00")')).toBe(true);
    expect(matchesCell('9:00', '["8:00".. "17:00"]')).toBe(true);
  });
});

describe('matchesCell FEEL boolean logic', () => {
  it('rejects unquoted and/or expressions loudly', () => {
    expect(() => matchesCell(7, '> 5 and < 10')).toThrow(/Boolean logic/);
    expect(() => matchesCell('x', 'a or b')).toThrow(/Boolean logic/);
    expect(() => matchesCell('x', 'or')).toThrow(/Boolean logic/);
  });

  it('still matches quoted text containing those words literally', () => {
    expect(matchesCell('a and b', '"a and b"')).toBe(true);
    expect(matchesCell('c', '"a and b"')).toBe(false);
    expect(matchesCell('2026-01-01T10:00', 'date and time("2026-01-01T10:00")')).toBe(true);
  });

  it('does not mistake substrings for keywords', () => {
    expect(matchesCell('random', 'random')).toBe(true);
    expect(matchesCell('candy', '"candy"')).toBe(true);
    expect(matchesCell('sand', 'sand')).toBe(true);
  });
});

describe('matchesCell escaped quotes', () => {
  it('unescapes quotes inside quoted strings', () => {
    expect(matchesCell('a"b', '"a\\"b"')).toBe(true);
    expect(matchesCell('ab', '"a\\"b"')).toBe(false);
    expect(matchesCell("it's", "'it\\'s'")).toBe(true);
  });

  it('keeps non-escape backslashes untouched', () => {
    expect(matchesCell('C:\\temp', '"C:\\temp"')).toBe(true);
  });

  it('splits lists on unescaped commas only', () => {
    expect(matchesCell('a"b', '"a\\"b","c"')).toBe(true);
    expect(matchesCell('b', '"a\\"b","c"')).toBe(false);
  });
});

describe('matchesCell international barewords', () => {
  it('matches unquoted values in any language', () => {
    expect(matchesCell('café', 'café')).toBe(true);
    expect(matchesCell('naïf', 'naïve')).toBe(false);
    expect(matchesCell('日本語', '日本語')).toBe(true);
  });
});

describe('matchesCell non-finite numbers', () => {
  it('treats overflow/Infinity strings as incomparable', () => {
    expect(matchesCell('1e999', '>5')).toBe(false);
    expect(matchesCell('Infinity', '>5')).toBe(false);
    expect(matchesCell(1e308, '>5')).toBe(true);
  });
});
