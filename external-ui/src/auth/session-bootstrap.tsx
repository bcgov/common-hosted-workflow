import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSession, toAuthenticatedSession } from '../services/backend/auth';
import { clearStoredAppToken, getStoredAppToken, setStoredAppToken } from '../services/backend/axios';
import { sessionState } from '../state/session';

function consumeTokenFromUrl() {
  const url = new URL(globalThis.location.href);
  const token = url.searchParams.get('token');
  if (!token) return null;

  url.searchParams.delete('token');
  globalThis.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  return token;
}

export function SessionBootstrap({ children }: { children: ReactNode }) {
  const [isTokenReady, setIsTokenReady] = useState(false);

  useEffect(() => {
    const tokenFromUrl = consumeTokenFromUrl();
    if (tokenFromUrl) {
      setStoredAppToken(tokenFromUrl);
    }

    setIsTokenReady(true);
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
