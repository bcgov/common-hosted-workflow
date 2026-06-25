import { getUiTenantRoles, setUiTenantRoles, deleteUiTenantRoles, type TenantRole } from './ui-oidc-store';
import { resolveSessionCache } from './resolve-session-cache';

export type FetchTenantRolesFn = (ssoUserId: string, accessToken: string) => Promise<TenantRole[]>;

export type ResolveTenantRolesParams = {
  email: string;
  ssoUserId: string;
  accessToken?: string;
  fetchFn: FetchTenantRolesFn;
};

/**
 * Cache-aside resolution for tenant roles.
 */
export async function resolveTenantRoles(params: ResolveTenantRolesParams): Promise<TenantRole[]> {
  const result = await resolveSessionCache<TenantRole[]>({
    email: params.email,
    ssoUserId: params.ssoUserId,
    accessToken: params.accessToken,
    label: 'tenant roles',
    getCached: getUiTenantRoles,
    setCached: setUiTenantRoles,
    fetchFn: params.fetchFn,
  });
  return result ?? [];
}

/**
 * Invalidates the cached tenant roles for a user (e.g. on token refresh).
 */
export async function invalidateTenantRoles(email: string): Promise<void> {
  await deleteUiTenantRoles(email);
}
