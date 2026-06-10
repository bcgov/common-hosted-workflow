/**
 * Unit tests for `src/api/routes/helpers/wil-query.ts`.
 */
import { describe, expect, it } from 'vitest';
import { parseSinceParam, parseLimit } from '../../../../src/api/routes/helpers/wil-query';

/* ================================================================== */
/*  parseSinceParam                                                    */
/* ================================================================== */

describe('parseSinceParam', () => {
  it('returns undefined when input is undefined', () => {
    expect(parseSinceParam(undefined)).toBeUndefined();
  });

  it('returns undefined when input is empty string', () => {
    expect(parseSinceParam('')).toBeUndefined();
  });

  it('parses a plain ISO date as time mode', () => {
    const result = parseSinceParam('2025-06-01T12:00:00.000Z');

    expect(result).toEqual({
      mode: 'time',
      since: new Date('2025-06-01T12:00:00.000Z'),
    });
  });

  it('returns undefined for an invalid date string without pipe', () => {
    expect(parseSinceParam('not-a-date')).toBeUndefined();
  });

  it('parses a cursor format (ISO|uuid) as cursor mode', () => {
    const result = parseSinceParam('2025-06-01T12:00:00.000Z|abc-123');

    expect(result).toEqual({
      mode: 'cursor',
      createdAt: new Date('2025-06-01T12:00:00.000Z'),
      id: 'abc-123',
    });
  });

  it('returns undefined when cursor format has invalid date before pipe', () => {
    expect(parseSinceParam('invalid-date|abc-123')).toBeUndefined();
  });

  it('returns undefined when cursor format has empty id after pipe', () => {
    expect(parseSinceParam('2025-06-01T12:00:00.000Z|')).toBeUndefined();
  });

  it('handles cursor with pipe in the id portion', () => {
    const result = parseSinceParam('2025-06-01T12:00:00.000Z|id-with|pipes');

    expect(result).toEqual({
      mode: 'cursor',
      createdAt: new Date('2025-06-01T12:00:00.000Z'),
      id: 'id-with|pipes',
    });
  });
});

/* ================================================================== */
/*  parseLimit                                                         */
/* ================================================================== */

describe('parseLimit', () => {
  it('returns default (20) when input is undefined', () => {
    expect(parseLimit(undefined)).toBe(20);
  });

  it('returns default (20) when input is empty string', () => {
    expect(parseLimit('')).toBe(20);
  });

  it('parses a valid number', () => {
    expect(parseLimit('50')).toBe(50);
  });

  it('returns default for non-numeric string', () => {
    expect(parseLimit('abc')).toBe(20);
  });

  it('returns default for zero', () => {
    expect(parseLimit('0')).toBe(20);
  });

  it('returns default for negative numbers', () => {
    expect(parseLimit('-5')).toBe(20);
  });

  it('caps at max limit (200)', () => {
    expect(parseLimit('500')).toBe(200);
  });

  it('allows exactly the max limit', () => {
    expect(parseLimit('200')).toBe(200);
  });

  it('parses float string by taking integer part', () => {
    expect(parseLimit('10.9')).toBe(10);
  });
});
