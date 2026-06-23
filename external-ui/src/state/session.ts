import { proxy, useSnapshot } from 'valtio';
import type { AuthenticatedSession, TenantRole } from '../services/backend/auth';

type SessionState = {
  session: AuthenticatedSession | null;
  isLoading: boolean;
};

export const sessionState = proxy<SessionState>({
  session: null,
  isLoading: true,
});

export function useSessionSnapshot() {
  return useSnapshot(sessionState);
}

export function useSession() {
  return useSnapshot(sessionState).session;
}

export function useAuthUser() {
  return useSnapshot(sessionState).session?.user ?? null;
}

export function usePermissions() {
  return useSnapshot(sessionState).session?.permissions ?? null;
}

export function useTenantRoles(): readonly TenantRole[] {
  return useSnapshot(sessionState).session?.tenantRoles ?? [];
}

export function useHasRole(roleName: string): boolean {
  const tenantRoles = useTenantRoles();
  return tenantRoles.some((t) => t.roles.includes(roleName));
}

export function useHasTenantRole(tenantId: string, roleName: string): boolean {
  const tenantRoles = useTenantRoles();
  const tenant = tenantRoles.find((t) => t.tenantId === tenantId);
  return tenant?.roles.includes(roleName) ?? false;
}

export function useSessionLoading() {
  return useSnapshot(sessionState).isLoading;
}
