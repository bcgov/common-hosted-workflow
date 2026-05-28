import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSession, type AuthSessionUser } from '../services/backend/auth';
import { buildApiUrl, clearStoredAppToken, getStoredAppToken, setStoredAppToken } from '../services/backend/axios';

interface AuthState {
  user: AuthSessionUser | null;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

function getCurrentUiPath() {
  const url = new URL(window.location.href);
  url.searchParams.delete('token');
  return url.toString();
}

function buildAuthRouteUrl(path: string, params: Record<string, string>) {
  const url = new URL(buildApiUrl(path));

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function consumeTokenFromUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  if (!token) return null;

  url.searchParams.delete('token');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  return token;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const tokenFromUrl = consumeTokenFromUrl();
    if (tokenFromUrl) {
      setStoredAppToken(tokenFromUrl);
    }

    if (!tokenFromUrl && !getStoredAppToken()) {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    getSession()
      .then((response) => {
        if (cancelled) return;
        if (!response.authenticated) {
          clearStoredAppToken();
        }
        setUser(response.authenticated ? response.user : null);
      })
      .catch(() => {
        if (!cancelled) {
          clearStoredAppToken();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    window.location.assign(buildAuthRouteUrl('/ui-api/auth/login', { returnTo: getCurrentUiPath() }));
  }, []);

  const logout = useCallback(() => {
    clearStoredAppToken();
    window.location.assign(buildAuthRouteUrl('/ui-api/auth/logout', { returnTo: getCurrentUiPath() }));
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
