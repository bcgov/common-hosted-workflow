import { createHash } from 'node:crypto';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Process-level TTL cache. A TTL of 0 disables caching entirely — set() becomes
 * a no-op — per the "Refresh Metadata Cache" / TTL=0 behaviour in spec section 9.
 */
export class TtlCache<T = unknown> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.ttlMs <= 0) return;
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

export function buildCacheKey(credentialId: string, scopeKey: string): string {
  // sha256 used for deterministic cache-key derivation — not a security context.
  return createHash('sha256').update(`${credentialId}:${scopeKey}`).digest('hex');
}

/**
 * Cache lifetime is per-credential (tenantId:clientId), not a single
 * process-global instance — two different Graph tenants/app registrations
 * must never share cached metadata (spec section 9). Shared between the
 * execute() path and the loadOptions dropdowns (methods/loadOptions.ts) so
 * opening the "add field" column picker reuses the same warm cache instead
 * of re-fetching site/list/column metadata from Graph on every open.
 */
const cachesByCredentialId = new Map<string, TtlCache<unknown>>();

/** @internal Test-only: clear all cached resolvers between tests. */
export function _resetCachesForTesting(): void {
  cachesByCredentialId.clear();
}

export function getCacheForCredential(credentialId: string, ttlMinutes: number, refresh: boolean): TtlCache<unknown> {
  let cache = cachesByCredentialId.get(credentialId);
  if (!cache) {
    cache = new TtlCache<unknown>(ttlMinutes * 60_000);
    cachesByCredentialId.set(credentialId, cache);
  }
  if (refresh) cache.clear();
  return cache;
}
