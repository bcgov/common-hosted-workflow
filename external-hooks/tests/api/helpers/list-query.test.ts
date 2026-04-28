import { describe, expect, it } from 'vitest';
import {
  optionalSinceOrCursorQueryParam,
  encodeListNextCursor,
  nextCursorFromPagedItems,
  limitQueryString,
} from '../../../src/api/helpers/list-query';

describe('optionalSinceOrCursorQueryParam', () => {
  it('parses a plain ISO date as time mode', () => {
    const result = optionalSinceOrCursorQueryParam.parse('2025-06-01T12:00:00.000Z');
    expect(result.mode).toBe('time');
    if (result.mode === 'time') {
      expect(result.since).toBeInstanceOf(Date);
      expect(result.since.toISOString()).toBe('2025-06-01T12:00:00.000Z');
    }
  });

  it('parses ISO|uuid as cursor mode', () => {
    const cursor = '2025-06-01T12:00:00.000Z|a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d';
    const result = optionalSinceOrCursorQueryParam.parse(cursor);
    expect(result.mode).toBe('cursor');
    if (result.mode === 'cursor') {
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.id).toBe('a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d');
    }
  });

  it('rejects an invalid ISO date', () => {
    expect(() => optionalSinceOrCursorQueryParam.parse('not-a-date')).toThrow();
  });

  it('rejects a cursor with invalid timestamp', () => {
    expect(() => optionalSinceOrCursorQueryParam.parse('bad-date|a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d')).toThrow();
  });

  it('rejects a cursor with invalid UUID', () => {
    expect(() => optionalSinceOrCursorQueryParam.parse('2025-06-01T12:00:00.000Z|not-a-uuid')).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => optionalSinceOrCursorQueryParam.parse('')).toThrow();
  });
});

describe('encodeListNextCursor', () => {
  it('encodes createdAt and id as ISO|uuid', () => {
    const row = { createdAt: new Date('2025-06-01T12:00:00.000Z'), id: 'abc-123' };
    expect(encodeListNextCursor(row)).toBe('2025-06-01T12:00:00.000Z|abc-123');
  });
});

describe('nextCursorFromPagedItems', () => {
  it('returns cursor when items.length equals pageLimit', () => {
    const items = [
      { createdAt: new Date('2025-06-01T12:00:00.000Z'), id: 'item-1' },
      { createdAt: new Date('2025-06-01T11:00:00.000Z'), id: 'item-2' },
    ];
    const cursor = nextCursorFromPagedItems(items, 2);
    expect(cursor).toBe('2025-06-01T11:00:00.000Z|item-2');
  });

  it('returns null when items.length is less than pageLimit', () => {
    const items = [{ createdAt: new Date('2025-06-01T12:00:00.000Z'), id: 'item-1' }];
    expect(nextCursorFromPagedItems(items, 10)).toBeNull();
  });

  it('returns null for empty items', () => {
    expect(nextCursorFromPagedItems([], 10)).toBeNull();
  });
});

describe('limitQueryString', () => {
  it('accepts a valid integer within range', () => {
    expect(limitQueryString.parse('50')).toBe(50);
  });

  it('accepts boundary value 1', () => {
    expect(limitQueryString.parse('1')).toBe(1);
  });

  it('accepts boundary value 200', () => {
    expect(limitQueryString.parse('200')).toBe(200);
  });

  it('rejects 0', () => {
    expect(() => limitQueryString.parse('0')).toThrow();
  });

  it('rejects values above 200', () => {
    expect(() => limitQueryString.parse('201')).toThrow();
  });

  it('rejects non-numeric strings', () => {
    expect(() => limitQueryString.parse('abc')).toThrow();
  });

  it('rejects decimal strings', () => {
    expect(() => limitQueryString.parse('3.5')).toThrow();
  });
});
