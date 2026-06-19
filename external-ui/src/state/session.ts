import { proxy, useSnapshot } from 'valtio';
import type { AuthenticatedSession } from '../services/backend/auth';

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

export function useSessionLoading() {
  return useSnapshot(sessionState).isLoading;
}
