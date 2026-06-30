import { getUiTenantGroups, setUiTenantGroups, deleteUiTenantGroups, type TenantGroup } from './ui-oidc-store';
import { resolveSessionCache } from './resolve-session-cache';

export type FetchTenantGroupsFn = (ssoUserId: string, accessToken: string) => Promise<TenantGroup[]>;

export type ResolveTenantGroupsParams = {
  email: string;
  ssoUserId: string;
  accessToken?: string;
  fetchFn: FetchTenantGroupsFn;
};

/**
 * Cache-aside resolution for tenant groups.
 */
export async function resolveTenantGroups(params: ResolveTenantGroupsParams): Promise<TenantGroup[]> {
  const result = await resolveSessionCache<TenantGroup[]>({
    email: params.email,
    ssoUserId: params.ssoUserId,
    accessToken: params.accessToken,
    label: 'tenant groups',
    getCached: getUiTenantGroups,
    setCached: setUiTenantGroups,
    fetchFn: params.fetchFn,
  });
  return result ?? [];
}

/**
 * Invalidates the cached tenant groups for a user (e.g. on token refresh).
 */
export async function invalidateTenantGroups(email: string): Promise<void> {
  await deleteUiTenantGroups(email);
}
