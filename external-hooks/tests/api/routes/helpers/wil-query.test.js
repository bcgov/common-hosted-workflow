'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
/**
 * Unit tests for `src/api/routes/helpers/wil-query.ts`.
 */
const vitest_1 = require('vitest');
const wil_query_1 = require('../../../../src/api/routes/helpers/wil-query');
/* ================================================================== */
/*  parseSinceParam                                                    */
/* ================================================================== */
(0, vitest_1.describe)('parseSinceParam', () => {
  (0, vitest_1.it)('returns undefined when input is undefined', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseSinceParam)(undefined)).toBeUndefined();
  });
  (0, vitest_1.it)('returns undefined when input is empty string', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseSinceParam)('')).toBeUndefined();
  });
  (0, vitest_1.it)('parses a plain ISO date as time mode', () => {
    const result = (0, wil_query_1.parseSinceParam)('2025-06-01T12:00:00.000Z');
    (0, vitest_1.expect)(result).toEqual({
      mode: 'time',
      since: new Date('2025-06-01T12:00:00.000Z'),
    });
  });
  (0, vitest_1.it)('returns undefined for an invalid date string without pipe', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseSinceParam)('not-a-date')).toBeUndefined();
  });
  (0, vitest_1.it)('parses a cursor format (ISO|uuid) as cursor mode', () => {
    const result = (0, wil_query_1.parseSinceParam)('2025-06-01T12:00:00.000Z|abc-123');
    (0, vitest_1.expect)(result).toEqual({
      mode: 'cursor',
      createdAt: new Date('2025-06-01T12:00:00.000Z'),
      id: 'abc-123',
    });
  });
  (0, vitest_1.it)('returns undefined when cursor format has invalid date before pipe', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseSinceParam)('invalid-date|abc-123')).toBeUndefined();
  });
  (0, vitest_1.it)('returns undefined when cursor format has empty id after pipe', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseSinceParam)('2025-06-01T12:00:00.000Z|')).toBeUndefined();
  });
  (0, vitest_1.it)('handles cursor with pipe in the id portion', () => {
    const result = (0, wil_query_1.parseSinceParam)('2025-06-01T12:00:00.000Z|id-with|pipes');
    (0, vitest_1.expect)(result).toEqual({
      mode: 'cursor',
      createdAt: new Date('2025-06-01T12:00:00.000Z'),
      id: 'id-with|pipes',
    });
  });
});
/* ================================================================== */
/*  parseLimit                                                         */
/* ================================================================== */
(0, vitest_1.describe)('parseLimit', () => {
  (0, vitest_1.it)('returns default (20) when input is undefined', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseLimit)(undefined)).toBe(20);
  });
  (0, vitest_1.it)('returns default (20) when input is empty string', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseLimit)('')).toBe(20);
  });
  (0, vitest_1.it)('parses a valid number', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseLimit)('50')).toBe(50);
  });
  (0, vitest_1.it)('returns default for non-numeric string', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseLimit)('abc')).toBe(20);
  });
  (0, vitest_1.it)('returns default for zero', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseLimit)('0')).toBe(20);
  });
  (0, vitest_1.it)('returns default for negative numbers', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseLimit)('-5')).toBe(20);
  });
  (0, vitest_1.it)('caps at max limit (200)', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseLimit)('500')).toBe(200);
  });
  (0, vitest_1.it)('allows exactly the max limit', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseLimit)('200')).toBe(200);
  });
  (0, vitest_1.it)('parses float string by taking integer part', () => {
    (0, vitest_1.expect)((0, wil_query_1.parseLimit)('10.9')).toBe(10);
  });
});
