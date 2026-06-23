import {
  getUiTenantRoles,
  setUiTenantRoles,
  deleteUiTenantRoles,
  getUiOidcAccessTokenByEmail,
  type TenantRole,
} from './ui-oidc-store';
import { createLogger } from '../utils/logger';

const log = createLogger('TenantRoles');

export type FetchTenantRolesFn = (ssoUserId: string, accessToken: string) => Promise<TenantRole[]>;

export type ResolveTenantRolesParams = {
  email: string;
  ssoUserId: string;
  accessToken?: string;
  fetchFn: FetchTenantRolesFn;
};

/**
 * Cache-aside resolution for tenant roles.
 *
 * 1. Returns cached value if present in Redis.
 * 2. On cache miss, calls the provided `fetchFn` to load roles from upstream.
 * 3. Stores the result in Redis for subsequent calls.
 *
 * The `fetchFn` is injected by the caller (typically a service method) so this
 * helper has no direct dependency on CstarService — only on the OIDC store.
 */
export async function resolveTenantRoles(params: ResolveTenantRolesParams): Promise<TenantRole[]> {
  const { email, ssoUserId, accessToken, fetchFn } = params;

  // Check cache first
  const cached = await getUiTenantRoles(email);
  if (cached) {
    return cached;
  }

  // Resolve access token — use provided or look up from store
  const token = accessToken ?? (await getUiOidcAccessTokenByEmail(email));
  if (!token) {
    log.debug('No access token available for tenant roles fetch', { email });
    return [];
  }

  // Fetch from upstream via injected function
  const tenantRoles = await fetchFn(ssoUserId, token);

  // Cache the result (even if empty, to avoid repeated upstream calls)
  await setUiTenantRoles(email, tenantRoles);

  return tenantRoles;
}

/**
 * Invalidates the cached tenant roles for a user (e.g. on token refresh).
 */
export async function invalidateTenantRoles(email: string): Promise<void> {
  await deleteUiTenantRoles(email);
}
