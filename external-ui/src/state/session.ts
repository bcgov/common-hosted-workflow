import { proxy, useSnapshot } from 'valtio';
import type { AuthenticatedSession, TenantRole } from '../services/backend/auth';

type SessionState = {
  session: AuthenticatedSession | null;
  isLoading: boolean;
};

/**
 * Global state for the logged-in user's session.
 *
 * This is a Valtio proxy object, which allows components to subscribe to changes in the session state.
 * Components can use the `useSessionSnapshot` hook to get a snapshot of the current session state.
 */
export const sessionState = proxy<SessionState>({
  session: null,
  isLoading: true,
});

/**
 * Hook to get a snapshot of the current session state.
 * Components can use this hook to access the session state and re-render when it changes.
 */
export function useSessionSnapshot() {
  return useSnapshot(sessionState);
}

/**
 * Hook to get the current authenticated session.
 * Returns null if the user is not logged in.
 */
export function useSession() {
  return useSnapshot(sessionState).session;
}

/**
 * Hook to get the current authenticated user.
 * Returns null if the user is not logged in.
 */
export function useAuthUser() {
  return useSnapshot(sessionState).session?.user ?? null;
}

/**
 * Hook to get the current authenticated user's permissions.
 * Returns null if the user is not logged in.
 */
export function usePermissions() {
  return useSnapshot(sessionState).session?.permissions ?? null;
}

/**
 * Hook to get the current authenticated user's tenants with roles.
 * Returns an empty array if the user is not logged in or has no tenant roles.
 */
export function useTenantRoles(): readonly TenantRole[] {
  return useSnapshot(sessionState).session?.tenantRoles ?? [];
}

/**
 * Hook to get the current authenticated user's roles for a specific tenant.
 * Returns an empty array if the user is not logged in or has no roles for the specified tenant.
 */
export function useTenantRolesById(tenantId: string): readonly string[] {
  return useTenantRoles().find((t) => t.tenantId === tenantId)?.roles ?? [];
}

/**
 * Hook to check if the current authenticated user has a specific role in any tenant.
 * Returns false if the user is not logged in or does not have the specified role.
 */
export function useHasRole(roleName: string): boolean {
  const tenantRoles = useTenantRoles();
  return tenantRoles.some((t) => t.roles.includes(roleName));
}

/**
 * Helper function to check if the current authenticated user has a specific role in a specific tenant.
 * Returns false if the user is not logged in or does not have the specified role in the specified tenant.
 */
function tenantHasRole(tenant: TenantRole | undefined, roleName: string): boolean {
  return tenant?.roles.includes(roleName) ?? false;
}

/**
 * Hook to check if the current authenticated user has a specific role in a specific tenant.
 * Returns false if the user is not logged in or does not have the specified role in the specified tenant.
 */
export function useHasTenantRole(tenantId: string, roleName: string): boolean {
  const tenantRoles = useTenantRoles();
  const tenant = tenantRoles.find((t) => t.tenantId === tenantId);
  return tenantHasRole(tenant, roleName);
}

/**
 * Hook to check if the current authenticated user has any of the specified roles in a specific tenant.
 * Returns false if the user is not logged in or does not have any of the specified roles in the specified tenant.
 */
export function useHasTenantRoles(tenantId: string, roleNames: string[]): boolean {
  const tenantRoles = useTenantRoles();
  const tenant = tenantRoles.find((t) => t.tenantId === tenantId);
  return roleNames.some((roleName) => tenantHasRole(tenant, roleName));
}

/**
 * Hook to check if the session state is currently loading.
 * Returns true if the session state is loading, false otherwise.
 */
export function useSessionLoading() {
  return useSnapshot(sessionState).isLoading;
}
