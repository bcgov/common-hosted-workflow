import { describe, expect, it } from 'vitest';
import { parsePositiveInteger, parseDate, parseOptionalBodyTimestamp } from '../../../src/api/utils/parse';

describe('parsePositiveInteger', () => {
  it('parses a valid positive integer string', () => {
    expect(parsePositiveInteger('42')).toBe(42);
  });

  it('returns null for undefined', () => {
    expect(parsePositiveInteger(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parsePositiveInteger('')).toBeNull();
  });

  it('returns null for non-numeric string', () => {
    expect(parsePositiveInteger('abc')).toBeNull();
  });

  it('returns null for zero', () => {
    expect(parsePositiveInteger('0')).toBeNull();
  });

  it('returns null for negative number string', () => {
    expect(parsePositiveInteger('-5')).toBeNull();
  });

  it('returns null for decimal string', () => {
    expect(parsePositiveInteger('3.14')).toBeNull();
  });
});

describe('parseDate', () => {
  it('parses a valid ISO date string', () => {
    const result = parseDate('2025-06-01T12:00:00.000Z');
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2025-06-01T12:00:00.000Z');
  });

  it('returns null for undefined', () => {
    expect(parseDate(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDate('')).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });
});

describe('parseOptionalBodyTimestamp', () => {
  it('returns undefined when value is undefined', () => {
    expect(parseOptionalBodyTimestamp(undefined)).toBeUndefined();
  });

  it('returns null when value is null', () => {
    expect(parseOptionalBodyTimestamp(null)).toBeNull();
  });

  it('parses a valid ISO string to Date', () => {
    const result = parseOptionalBodyTimestamp('2025-12-31T00:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2025-12-31T00:00:00.000Z');
  });

  it('returns undefined for an invalid date string', () => {
    expect(parseOptionalBodyTimestamp('not-a-date')).toBeUndefined();
  });

  it('returns undefined for non-string types', () => {
    expect(parseOptionalBodyTimestamp(12345)).toBeUndefined();
    expect(parseOptionalBodyTimestamp(true)).toBeUndefined();
  });
});
