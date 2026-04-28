import { describe, expect, it } from 'vitest';
import {
  flattenQueryParams,
  emptyQueryValueToUndefined,
  asParamRecord,
} from '../../../src/api/utils/query-params-preprocess';

describe('flattenQueryParams', () => {
  it('passes through plain string values', () => {
    expect(flattenQueryParams({ foo: 'bar', baz: 'qux' })).toEqual({ foo: 'bar', baz: 'qux' });
  });

  it('takes the first element of an array value', () => {
    expect(flattenQueryParams({ tags: ['a', 'b'] })).toEqual({ tags: 'a' });
  });

  it('converts undefined/null values to undefined', () => {
    const result = flattenQueryParams({ a: undefined, b: null });
    expect(result.a).toBeUndefined();
    expect(result.b).toBeUndefined();
  });

  it('handles array with undefined first element', () => {
    const result = flattenQueryParams({ x: [undefined] });
    expect(result.x).toBeUndefined();
  });

  it('handles array with null first element', () => {
    const result = flattenQueryParams({ x: [null] });
    expect(result.x).toBeUndefined();
  });

  it('stringifies non-string array elements', () => {
    const result = flattenQueryParams({ x: [42] });
    expect(result.x).toBe('42');
  });

  it('returns empty object for null input', () => {
    expect(flattenQueryParams(null)).toEqual({});
  });

  it('returns empty object for undefined input', () => {
    expect(flattenQueryParams(undefined)).toEqual({});
  });

  it('returns empty object for array input', () => {
    expect(flattenQueryParams(['a', 'b'])).toEqual({});
  });

  it('returns empty object for non-object input', () => {
    expect(flattenQueryParams('string')).toEqual({});
  });
});

describe('emptyQueryValueToUndefined', () => {
  it('returns undefined for empty string', () => {
    expect(emptyQueryValueToUndefined('')).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(emptyQueryValueToUndefined(undefined)).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(emptyQueryValueToUndefined(null)).toBeUndefined();
  });

  it('passes through non-empty values', () => {
    expect(emptyQueryValueToUndefined('hello')).toBe('hello');
    expect(emptyQueryValueToUndefined(42)).toBe(42);
  });
});

describe('asParamRecord', () => {
  it('returns the object as-is when valid', () => {
    const params = { id: '123', name: 'test' };
    expect(asParamRecord(params)).toEqual(params);
  });

  it('returns empty object for null', () => {
    expect(asParamRecord(null)).toEqual({});
  });

  it('returns empty object for undefined', () => {
    expect(asParamRecord(undefined)).toEqual({});
  });

  it('returns empty object for array', () => {
    expect(asParamRecord(['a'])).toEqual({});
  });

  it('returns empty object for primitive', () => {
    expect(asParamRecord('string')).toEqual({});
  });
});
