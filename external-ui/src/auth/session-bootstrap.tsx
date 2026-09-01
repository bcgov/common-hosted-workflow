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
    tenantGroups: response.tenantGroups ?? [],
  };
}

function getSessionHandleFromUrl() {
  const url = new URL(globalThis.location.href);
  const session = url.searchParams.get('session');
  if (!session) return null;

  return session;
}

function clearSecurityParamsFromUrl() {
  const url = new URL(globalThis.location.href);
  const keys = ['session', 'continue', 'signedOut', 'logout'];
  let changed = false;
  for (const key of keys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) {
    globalThis.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }
}

function consumeSignedOutMarker() {
  const url = new URL(globalThis.location.href);
  if (url.searchParams.get('signedOut') !== '1') return false;

  url.searchParams.delete('signedOut');
  globalThis.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}

export function resolveContinuationUrl(continueTo: string | null, origin: string): string | null {
  if (!continueTo) return null;

  // Resolve against the current origin and require the result to stay local:
  // reject authority-relative forms, backslashes, and foreign origins so the
  // browser never navigates to a non-local continuation.
  if (continueTo.startsWith('//') || continueTo.includes('\\')) return null;

  try {
    const resolved = new URL(continueTo, origin);
    if (resolved.origin !== origin) return null;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

function getContinueUrl() {
  const url = new URL(globalThis.location.href);
  return resolveContinuationUrl(url.searchParams.get('continue'), url.origin);
}

export function clearSessionHandleFromUrl() {
  // Backwards-compatible helper: delegate to full security cleanup so
  // session, continue, signedOut and logout are removed together while
  // preserving unrelated query/hash values.
  clearSecurityParamsFromUrl();
}

export { clearSecurityParamsFromUrl };

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
      if (consumeSignedOutMarker()) {
        clearStoredAppToken();
      }

      const sessionHandle = getSessionHandleFromUrl();
      if (sessionHandle) {
        // Capture continuation before cleaning, so valid navigation can still occur.
        const continueTo = getContinueUrl();
        try {
          const result = await exchangeSessionOnce(sessionHandle);
          if (!cancelled) {
            setStoredAppToken(result.token);
            clearSecurityParamsFromUrl();
            if (continueTo) {
              globalThis.location.replace(continueTo);
              return;
            }
          }
        } catch {
          if (!cancelled) {
            clearStoredAppToken();
            clearSecurityParamsFromUrl();
          }
        }
      } else {
        // No session handle — still remove any stale security params (continue,
        // logout, or leftover signedOut/session) so they do not persist in history.
        // Valid continuation occurs only after a successful exchange, so we do
        // not navigate here.
        const url = new URL(globalThis.location.href);
        if (
          url.searchParams.has('continue') ||
          url.searchParams.has('logout') ||
          url.searchParams.has('session') ||
          url.searchParams.has('signedOut')
        ) {
          // consumeSignedOutMarker already handled signedOut=1 case above;
          // for remaining markers, clean them without navigating.
          clearSecurityParamsFromUrl();
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
