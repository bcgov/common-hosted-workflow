import { describe, expect, it } from 'vitest';
import { extractBearerToken } from '../../../src/api/helpers/bearer';

describe('extractBearerToken', () => {
  it('extracts token from valid Bearer header', () => {
    expect(extractBearerToken('Bearer my-token-123')).toBe('my-token-123');
  });

  it('is case-insensitive for the Bearer prefix', () => {
    expect(extractBearerToken('bearer my-token')).toBe('my-token');
    expect(extractBearerToken('BEARER my-token')).toBe('my-token');
  });

  it('trims whitespace from the token', () => {
    expect(extractBearerToken('Bearer   spaced-token  ')).toBe('spaced-token');
  });

  it('returns null for undefined header', () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractBearerToken('')).toBeNull();
  });

  it('returns null for header without Bearer prefix', () => {
    expect(extractBearerToken('Basic abc123')).toBeNull();
  });

  it('returns null for "Bearer" with no token', () => {
    expect(extractBearerToken('Bearer')).toBeNull();
  });
});
