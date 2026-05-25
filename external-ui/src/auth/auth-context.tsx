import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User } from 'oidc-client-ts';
import { userManager } from './config';
import { clearStoredAppToken, setStoredAppToken } from '../services/backend/axios';

interface AuthState {
  user: User | null;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleUserLoaded = (u: User) => {
      setStoredAppToken(u.access_token);
      setUser(u);
      setIsLoading(false);
    };
    const handleUserUnloaded = () => {
      clearStoredAppToken();
      setUser(null);
      setIsLoading(false);
    };
    const handleSilentRenewError = () => {
      setIsLoading(false);
    };

    userManager.events.addUserLoaded(handleUserLoaded);
    userManager.events.addUserUnloaded(handleUserUnloaded);
    userManager.events.addSilentRenewError(handleSilentRenewError);

    userManager
      .signinRedirectCallback()
      .then((u) => {
        setUser(u);
        window.history.replaceState({}, '', userManager.settings.redirect_uri?.replace('/auth/callback', '') ?? '/ui');
      })
      .catch(() => {
        return userManager.getUser();
      })
      .then((u) => {
        if (u && !u.expired) {
          setStoredAppToken(u.access_token);
        } else {
          clearStoredAppToken();
        }
        if (u && !u.expired) {
          setUser(u);
        }
        setIsLoading(false);
      });

    return () => {
      userManager.events.removeUserLoaded(handleUserLoaded);
      userManager.events.removeUserUnloaded(handleUserUnloaded);
      userManager.events.removeSilentRenewError(handleSilentRenewError);
    };
  }, []);

  const login = useCallback(() => {
    userManager.signinRedirect();
  }, []);

  const logout = useCallback(() => {
    userManager.signoutRedirect();
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
