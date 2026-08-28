import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache, buildCacheKey } from '../../nodes/BcGovSharePoint/transport/cache';

describe('TtlCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns undefined for a missing key', () => {
    const cache = new TtlCache<string>(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns a value before it expires', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('key', 'value');
    vi.advanceTimersByTime(500);
    expect(cache.get('key')).toBe('value');
  });

  it('expires a value after the TTL elapses', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('key', 'value');
    vi.advanceTimersByTime(1001);
    expect(cache.get('key')).toBeUndefined();
  });

  it('never stores a value when TTL is 0 (disabled)', () => {
    const cache = new TtlCache<string>(0);
    cache.set('key', 'value');
    expect(cache.get('key')).toBeUndefined();
  });

  it('deletes and clears entries', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
    cache.clear();
    expect(cache.get('b')).toBeUndefined();
  });
});

describe('buildCacheKey', () => {
  it('produces a stable hash for the same inputs', () => {
    expect(buildCacheKey('cred-1', 'site:foo')).toBe(buildCacheKey('cred-1', 'site:foo'));
  });

  it('produces different hashes for different scopes', () => {
    expect(buildCacheKey('cred-1', 'site:foo')).not.toBe(buildCacheKey('cred-1', 'site:bar'));
  });

  it('produces different hashes for different credentials', () => {
    expect(buildCacheKey('cred-1', 'site:foo')).not.toBe(buildCacheKey('cred-2', 'site:foo'));
  });
});
