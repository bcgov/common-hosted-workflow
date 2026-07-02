import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  exchangeSession,
  getSession,
  type AuthExchangeResponse,
  type AuthSessionResponse,
  type AuthenticatedSession,
} from '../services/backend/auth';
import { clearStoredAppToken, getStoredAppToken, setStoredAppToken } from '../services/backend/axios';
import { sessionState } from '../state/session';

const sessionExchangeRequests = new Map<string, Promise<AuthExchangeResponse>>();

function toAuthenticatedSession(response: AuthSessionResponse): AuthenticatedSession | null {
  if (!response.authenticated || !response.user || !response.oidc || !response.n8nUser || !response.permissions) {
    return null;
  }

  return {
    user: response.user,
    oidc: response.oidc,
    n8nUser: response.n8nUser,
    permissions: response.permissions,
    tenantRoles: response.tenantRoles ?? [],
  };
}

function getSessionHandleFromUrl() {
  const url = new URL(globalThis.location.href);
  const session = url.searchParams.get('session');
  if (!session) return null;

  return session;
}

function clearSessionHandleFromUrl() {
  const url = new URL(globalThis.location.href);
  if (!url.searchParams.has('session')) {
    return;
  }

  url.searchParams.delete('session');
  globalThis.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function exchangeSessionOnce(sessionHandle: string) {
  const existing = sessionExchangeRequests.get(sessionHandle);
  if (existing) {
    return existing;
  }

  const request = exchangeSession(sessionHandle).finally(() => {
    sessionExchangeRequests.delete(sessionHandle);
  });
  sessionExchangeRequests.set(sessionHandle, request);
  return request;
}

export function SessionBootstrap({ children }: { children: ReactNode }) {
  const [isTokenReady, setIsTokenReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapToken() {
      const sessionHandle = getSessionHandleFromUrl();
      if (sessionHandle) {
        try {
          const result = await exchangeSessionOnce(sessionHandle);
          if (!cancelled) {
            setStoredAppToken(result.token);
            clearSessionHandleFromUrl();
          }
        } catch {
          if (!cancelled) {
            clearStoredAppToken();
            clearSessionHandleFromUrl();
          }
        }
      }

      if (!cancelled) {
        setIsTokenReady(true);
      }
    }

    void bootstrapToken();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasToken = isTokenReady && Boolean(getStoredAppToken());

  const sessionQuery = useQuery({
    queryKey: ['session', hasToken ? 'authenticated' : 'anonymous'],
    queryFn: ({ signal }) => getSession({ signal }),
    enabled: hasToken,
    retry: false,
  });

  useEffect(() => {
    if (!isTokenReady) {
      sessionState.isLoading = true;
      return;
    }

    if (!hasToken) {
      sessionState.session = null;
      sessionState.isLoading = false;
      return;
    }

    sessionState.isLoading = sessionQuery.isLoading;

    if (sessionQuery.data) {
      const authenticatedSession = toAuthenticatedSession(sessionQuery.data);
      if (!authenticatedSession) {
        clearStoredAppToken();
      }
      sessionState.session = authenticatedSession;
      sessionState.isLoading = false;
      return;
    }

    if (sessionQuery.isError) {
      clearStoredAppToken();
      sessionState.session = null;
      sessionState.isLoading = false;
    }
  }, [hasToken, isTokenReady, sessionQuery.data, sessionQuery.isError, sessionQuery.isLoading]);

  return <>{children}</>;
}
