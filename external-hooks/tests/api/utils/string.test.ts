import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  shortenIdForLog,
  isNonEmptyString,
  trimString,
  applyLowercaseToZodEnum,
  applyLowercaseToOptionalZodEnum,
} from '../../../src/api/utils/string';

describe('shortenIdForLog', () => {
  it('returns "(none)" for undefined', () => {
    expect(shortenIdForLog(undefined)).toBe('(none)');
  });

  it('returns "(none)" for empty string', () => {
    expect(shortenIdForLog('')).toBe('(none)');
  });

  it('returns full string when 8 chars or fewer', () => {
    expect(shortenIdForLog('abcd1234')).toBe('abcd1234');
  });

  it('truncates and appends ellipsis when longer than 8 chars', () => {
    expect(shortenIdForLog('abcdefghij')).toBe('abcdefgh...');
  });

  it('trims whitespace before measuring length', () => {
    expect(shortenIdForLog('  short  ')).toBe('short');
  });
});

describe('isNonEmptyString', () => {
  it('returns true for a non-empty string', () => {
    expect(isNonEmptyString('hello')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isNonEmptyString('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isNonEmptyString('   ')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isNonEmptyString(42)).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
  });
});

describe('trimString', () => {
  it('trims whitespace from a string', () => {
    expect(trimString('  hello  ')).toBe('hello');
  });

  it('returns empty string for non-string values', () => {
    expect(trimString(42)).toBe('');
    expect(trimString(null)).toBe('');
    expect(trimString(undefined)).toBe('');
  });
});

describe('applyLowercaseToZodEnum', () => {
  const schema = applyLowercaseToZodEnum(z.enum(['active', 'read']));

  it('accepts a lowercase value', () => {
    expect(schema.parse('active')).toBe('active');
  });

  it('lowercases an uppercase value', () => {
    expect(schema.parse('ACTIVE')).toBe('active');
  });

  it('trims and lowercases', () => {
    expect(schema.parse('  Read  ')).toBe('read');
  });

  it('rejects an invalid enum value', () => {
    expect(() => schema.parse('unknown')).toThrow();
  });
});

describe('applyLowercaseToOptionalZodEnum', () => {
  const schema = applyLowercaseToOptionalZodEnum(z.enum(['pending', 'completed']));

  it('passes through undefined', () => {
    expect(schema.parse(undefined)).toBeUndefined();
  });

  it('lowercases a valid value', () => {
    expect(schema.parse('PENDING')).toBe('pending');
  });

  it('rejects an invalid value', () => {
    expect(() => schema.parse('invalid')).toThrow();
  });
});
