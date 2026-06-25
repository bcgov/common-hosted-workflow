import { getUiOidcAccessTokenByEmail } from './ui-oidc-store';
import { createLogger } from '../utils/logger';

const log = createLogger('SessionCache');

export type ResolveSessionCacheParams<T> = {
  email: string;
  ssoUserId: string;
  accessToken?: string;
  label: string;
  getCached: (email: string) => Promise<T | null>;
  setCached: (email: string, value: T) => Promise<void>;
  fetchFn: (ssoUserId: string, accessToken: string) => Promise<T>;
};

/**
 * Generic cache-aside resolution for session-scoped data.
 *
 * 1. Returns cached value if present in Redis.
 * 2. On cache miss, resolves access token and calls fetchFn.
 * 3. Stores the result in Redis for subsequent calls.
 */
export async function resolveSessionCache<T>(params: ResolveSessionCacheParams<T>): Promise<T | null> {
  const { email, ssoUserId, accessToken, label, getCached, setCached, fetchFn } = params;

  const cached = await getCached(email);
  if (cached) {
    return cached;
  }

  const token = accessToken ?? (await getUiOidcAccessTokenByEmail(email));
  if (!token) {
    log.debug(`No access token available for ${label} fetch`, { email });
    return null;
  }

  const result = await fetchFn(ssoUserId, token);
  await setCached(email, result);

  return result;
}
