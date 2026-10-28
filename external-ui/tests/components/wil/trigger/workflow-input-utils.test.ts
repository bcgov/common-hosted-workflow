import { describe, expect, it } from 'vitest';
import {
  formatInputValue,
  isParseError,
  parseInputValue,
  pruneInputValues,
} from '../../../../src/components/wil/trigger/workflow-input-utils';

describe('parseInputValue', () => {
  it('treats blank text as unset', () => {
    expect(parseInputValue('string', '  ')).toBeUndefined();
  });

  it('parses typed values', () => {
    expect(parseInputValue('number', '4.5')).toBe(4.5);
    expect(parseInputValue('boolean', 'false')).toBe(false);
    expect(parseInputValue('object', '{"a":1}')).toEqual({ a: 1 });
    expect(parseInputValue('array', '[1]')).toEqual([1]);
    expect(parseInputValue('string', ' keep spaces ')).toBe(' keep spaces ');
  });

  it('reports invalid text per type', () => {
    expect(isParseError(parseInputValue('number', 'abc'))).toBe(true);
    expect(isParseError(parseInputValue('boolean', 'yes'))).toBe(true);
    expect(isParseError(parseInputValue('object', '[1]'))).toBe(true);
    expect(isParseError(parseInputValue('array', '{}'))).toBe(true);
    expect(isParseError(parseInputValue('object', '{'))).toBe(true);
  });
});

describe('formatInputValue / pruneInputValues', () => {
  it('formats structured values as JSON and empties as blank', () => {
    expect(formatInputValue('object', { a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatInputValue('number', 3)).toBe('3');
    expect(formatInputValue('string', undefined)).toBe('');
  });

  it('drops unset and undeclared values', () => {
    expect(pruneInputValues([{ name: 'a', type: 'string' }], { a: 'x', b: 1, c: undefined })).toEqual({ a: 'x' });
    expect(pruneInputValues([{ name: 'a', type: 'string' }], { a: '' })).toEqual({});
  });
});
