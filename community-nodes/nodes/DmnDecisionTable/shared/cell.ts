/**
 * Locked cell-expression subset for the generic DMN Decision Table node.
 *
 * Supported (case-insensitive where noted):
 * - wildcard: '', '-', 'any'
 * - equality: '"quoted"', "'quoted'", bareword, number, true/false (insensitive;
 *   webhook-style 'true'/'false' strings match boolean cells)
 * - explicit null: 'null' (matches only null/undefined input)
 * - comparisons: '> < >= <= = == != <>' (numbers with numbers, ISO dates with
 *   dates, HH:MM times with times — mixing domains never matches)
 * - ranges: '[a..b]', '(a..b)', '[a..b)', '(a..b]' (same-domain bounds)
 * - times: 'H:MM' values (e.g. time("09:00")) compare chronologically
 * - lists: '"a","b"' or '["a","b"]' (each option is a full unary test; comma is OR)
 * - negation: 'not(...)' wrapping any of the above
 * - FEEL constructors: 'date("2026-01-01")', 'time("10:00:00")',
 *   'date and time("...")' / 'datetime("...")' unwrap to their inner literal
 * - escapes: backslash escapes (\", \', \\) work inside quoted strings
 *
 * Unquoted FEEL boolean logic (and/or/in/between/...) is rejected loudly —
 * quote such text to match it literally. Anything else throws.
 */

const UNSUPPORTED_HINT =
  'Unsupported cell expression. Supported: wildcards (-, any), equality, comparisons, ranges [a..b], lists "a","b", not(...).';

const FEEL_KEYWORDS = /\b(and|or|in|between|some|every|if|then|else|for|return)\b|\binstance\s+of\b/i;

const QUOTED_LITERAL = /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/s;
const BARE_LITERAL = /^[\p{L}\p{N}_.@+/: -]+$/u;

function unquotedSyntax(text: string): string {
  return text
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gs, ' ')
    .replace(/\bdate\s+and\s+time(?=\s*\()/gi, 'datetime');
}

function stripQuotes(raw: string): { quoted: boolean; value: string } {
  const text = raw.trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      // Unescape only the meaningful sequences (\\, \", \'); anything else
      // (e.g. Windows paths like "C:\temp") is left untouched.
      return { quoted: true, value: text.slice(1, -1).replace(/\\(\\|"|')/g, '$1') };
    }
  }
  return { quoted: false, value: text };
}

/**
 * Validates exactly one literal before any comparison or negation can turn
 * invalid syntax into a match. Constructors are literal wrappers, not FEEL
 * function evaluation: one quoted or bare scalar argument, no nested calls.
 * Domain comparability is deliberately separate from syntax validation.
 */
function parseCellLiteral(raw: string): { quoted: boolean; value: string } {
  const text = raw.trim();
  const constructor = /^(?:date\s+and\s+time|datetime|date|time)\s*\((.*)\)$/is.exec(text);
  const literal = constructor ? constructor[1].trim() : text;
  if (QUOTED_LITERAL.test(literal) || (BARE_LITERAL.test(literal) && !FEEL_KEYWORDS.test(literal))) {
    return stripQuotes(literal);
  }
  throw new Error(`${UNSUPPORTED_HINT} Got "${raw}".`);
}

/**
 * Splits on a delimiter (including '..'), ignoring it inside quotes or brackets.
 * Backslash-escaped quotes do not toggle quoting, so values like "a\"b"
 * survive as one unit. Exported for reuse (e.g. parsing `<outputValues>`).
 */
export function splitTopLevel(text: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  let current = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\' && quote) {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '[' || char === '(') depth += 1;
    if (char === ']' || char === ')') depth -= 1;
    if (depth < 0) throw new Error('Unbalanced cell expression brackets');
    if (delimiter !== '' && text.startsWith(delimiter, index) && depth === 0) {
      parts.push(current);
      current = '';
      index += delimiter.length - 1;
      continue;
    }
    current += char;
  }
  if (quote || depth !== 0) throw new Error('Unbalanced cell expression quotes or brackets');
  parts.push(current);
  return parts;
}

function isIsoDateLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value.trim());
}

/**
 * Parses a time-only value ('H:MM' with optional ':SS[.fff]') to
 * milliseconds since midnight so shift/schedule tables can compare times
 * chronologically. Returns null when the value is not a time-only literal.
 */
function toTimeMillis(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? '0');
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const fraction = match[4] ? Number(`0.${match[4]}`) : 0;
  return ((hours * 60 + minutes) * 60 + seconds + fraction) * 1000;
}

type ComparableDomain = 'number' | 'time' | 'date';

interface Comparable {
  domain: ComparableDomain;
  value: number;
}

function toComparable(value: unknown): Comparable | null {
  if (typeof value === 'number' && Number.isFinite(value)) return { domain: 'number', value };
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // isFinite (not just !isNaN) so '1e999'/'Infinity' stay incomparable.
    if (trimmed !== '' && Number.isFinite(Number(trimmed))) return { domain: 'number', value: Number(trimmed) };
    const time = toTimeMillis(trimmed);
    if (time !== null) return { domain: 'time', value: time };
    if (isIsoDateLike(trimmed)) {
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) return { domain: 'date', value: parsed };
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { domain: 'date', value: value.getTime() };
  return null;
}

/**
 * Compares actual against an expected operand.
 * Returns -1/0/1 when BOTH sides are comparable within the SAME domain
 * (numbers with numbers, dates with dates, times with times),
 * otherwise null (incomparable — callers treat as no match, never coerce
 * across domains or fall back to lexicographic comparison).
 */
function compareValues(actual: unknown, expectedRaw: string): number | null {
  const expected = parseCellLiteral(expectedRaw).value;
  const actualComp = toComparable(actual);
  const expectedComp = toComparable(expected);
  if (actualComp !== null && expectedComp !== null && actualComp.domain === expectedComp.domain) {
    if (actualComp.value < expectedComp.value) return -1;
    if (actualComp.value > expectedComp.value) return 1;
    return 0;
  }
  return null;
}

function equalsValue(actual: unknown, expectedRaw: string): boolean {
  const { quoted, value: expected } = parseCellLiteral(expectedRaw);
  if (!quoted) {
    const lowered = expected.toLowerCase();
    // Webhook/form inputs commonly arrive as strings; accept the canonical
    // spellings alongside real booleans (mirrors the numeric leniency below).
    if (lowered === 'true')
      return actual === true || (typeof actual === 'string' && actual.trim().toLowerCase() === 'true');
    if (lowered === 'false')
      return actual === false || (typeof actual === 'string' && actual.trim().toLowerCase() === 'false');
    if (lowered === 'null') return actual === null || actual === undefined;
    if (expected !== '' && !Number.isNaN(Number(expected)) && typeof actual === 'number') {
      return actual === Number(expected);
    }
    if (typeof actual === 'number' || typeof actual === 'boolean') {
      return String(actual).toLowerCase() === lowered;
    }
  }
  if (actual === null || actual === undefined) return false;
  return String(actual) === expected;
}

function matchesRange(actual: unknown, expression: string): boolean {
  const text = expression.trim();
  const first = text[0];
  const last = text[text.length - 1];
  const lowerInclusive = first === '[';
  const upperInclusive = last === ']';
  if (!((first === '[' || first === '(') && (last === ']' || last === ')'))) {
    throw new Error(`Invalid range expression "${expression}"`);
  }
  const inner = text.slice(1, -1);
  const cleaned = splitOnRange(inner);
  if (cleaned.length !== 2) {
    throw new Error(`Invalid range expression "${expression}". Expected [a..b] form.`);
  }
  const [lowerRaw, upperRaw] = cleaned;
  const lower = compareValues(actual, lowerRaw);
  const upper = compareValues(actual, upperRaw);
  if (lower === null || upper === null) return false;
  const lowerOk = lowerInclusive ? lower >= 0 : lower > 0;
  const upperOk = upperInclusive ? upper <= 0 : upper < 0;
  return lowerOk && upperOk;
}

function splitOnRange(inner: string): string[] {
  const bounds = splitTopLevel(inner, '..').map((bound) => bound.trim());
  // Quoted '..' is literal data, including inside constructor arguments.
  // Keep rejecting extra unquoted separators, even within a wrapper.
  if (bounds.length !== 2 || bounds.some((bound) => bound === '' || unquotedSyntax(bound).includes('..'))) {
    throw new Error(`Invalid range expression "[${inner}]". Expected [a..b] form.`);
  }
  return bounds;
}

function matchesList(actual: unknown, expression: string, depth: number): boolean {
  const options = splitTopLevel(expression, ',').map((part) => part.trim());
  if (options.some((part) => part === '')) {
    throw new Error(`Invalid list expression "${expression}".`);
  }
  // Evaluate every alternative so a matching first option cannot hide an
  // invalid later option. Never reinterpret unsupported syntax as a literal.
  return options.map((option) => matchesCellAtDepth(actual, option, depth + 1)).some(Boolean);
}

function matchesComparison(actual: unknown, expression: string): boolean {
  const match = /^(>=|<=|<>|!=|==|=|>|<)\s*(.+)$/s.exec(expression.trim());
  if (!match) {
    throw new Error(UNSUPPORTED_HINT);
  }
  const [, operator, operand] = match;
  if (operand.trim() === '' || /^[><=!]+$/.test(operand.trim())) {
    throw new Error(`Invalid comparison expression "${expression}".`);
  }
  // Equality operators reuse equalsValue (handles booleans/null/numbers).
  if (operator === '=' || operator === '==') return equalsValue(actual, operand);
  if (operator === '!=' || operator === '<>') {
    return !equalsValue(actual, operand);
  }
  const comparison = compareValues(actual, operand);
  if (comparison === null) return false;
  switch (operator) {
    case '>':
      return comparison > 0;
    case '<':
      return comparison < 0;
    case '>=':
      return comparison >= 0;
    case '<=':
      return comparison <= 0;
    default:
      throw new Error(UNSUPPORTED_HINT);
  }
}

/**
 * Tests a single input value against one cell expression.
 * Throws on expressions outside the locked subset.
 */
export function matchesCell(actual: unknown, expression: string): boolean {
  if (expression.length > 100_000) throw new Error('Cell expression exceeds the 100,000 character limit');
  return matchesCellAtDepth(actual, expression, 0);
}

function matchesCellAtDepth(actual: unknown, expression: string, depth: number): boolean {
  if (depth > 64) throw new Error('Cell expression exceeds the nesting limit of 64');
  const text = (expression ?? '').trim();
  if (text === '' || text === '-' || text.toLowerCase() === 'any') return true;

  // Preserve this existing literal shorthand without a general error fallback.
  if (text === '[(]') return actual === '(';

  // Split before not(): not("a"), not("b") is two unary tests, not one
  // greedy negation. Also keep the outer brackets of separate ranges intact.
  if (splitTopLevel(text, ',').length > 1) return matchesList(actual, text, depth);

  const notMatch = /^not\s*\((.*)\)$/is.exec(text);
  if (notMatch) {
    const inner = notMatch[1].trim();
    if (inner === '') throw new Error(`Invalid not() expression "${expression}".`);
    return !matchesCellAtDepth(actual, inner, depth + 1);
  }

  // Unquoted FEEL boolean logic is outside the locked subset. Reject it
  // loudly (instead of literal-matching it into silent misses); quoted text
  // and date/time constructors are explicit literals and pass through.
  if (FEEL_KEYWORDS.test(unquotedSyntax(text))) {
    throw new Error(
      `${UNSUPPORTED_HINT} Boolean logic (and/or/...) is not supported. Quote literal text containing those words. Got "${expression}".`,
    );
  }

  const comparisonMatch = /^(>=|<=|<>|!=|==|=|>|<)\s*.+$/s.test(text);
  if (comparisonMatch) return matchesComparison(actual, text);

  // Bracketed: '["a", "b"]' is membership, '[a..b]' is a range.
  // Any '(' opener or top-level '..' means a range attempt (validated inside).
  if (text.startsWith('(')) return matchesRange(actual, text);
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim();
    if (splitTopLevel(inner, '..').length === 1) return matchesList(actual, inner, depth);
    return matchesRange(actual, text);
  }
  if (text.startsWith('[')) return matchesRange(actual, text);

  // Standalone equality, comparison operands and range bounds share the
  // same literal grammar (including the supported date/time wrappers).
  return equalsValue(actual, text);
}
