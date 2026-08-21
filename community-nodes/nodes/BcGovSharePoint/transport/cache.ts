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
  return createHash('sha1').update(`${credentialId}:${scopeKey}`).digest('hex');
}
