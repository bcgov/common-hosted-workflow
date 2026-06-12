import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { getWhoami } from '../services/backend/auth';
import { getMyAccessRequest } from '../services/backend/access-requests';
import { getStoredAppToken } from '../services/backend/axios';
import { isAdminRole } from '../lib/roles';
import { withAppBasePath } from '../config/base-path';
import { IconLogin2, IconLogout } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from '@/components/ui/navigation-menu';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, isLoading, login, logout } = useAuth();
  const hasToken = Boolean(getStoredAppToken());
  const canQueryMyRequest = !isLoading && (Boolean(user) || hasToken);

  const whoamiQuery = useQuery({
    queryKey: ['whoami', user?.email ?? ''],
    queryFn: ({ signal }) => getWhoami({ signal }),
    enabled: Boolean(user),
  });

  const myAccessRequestQuery = useQuery({
    queryKey: ['access-requests', 'my', user?.email ?? ''],
    queryFn: ({ signal }) => getMyAccessRequest({ signal }),
    enabled: canQueryMyRequest,
  });

  const isAdmin = isAdminRole(whoamiQuery.data?.n8nUser?.role?.slug);
  const hasPendingAccessRequest = myAccessRequestQuery.data?.accessRequest?.status === 'pending';
  const showAccessRequestLink = hasPendingAccessRequest && !isAdmin;

  return (
    <div className="flex min-h-svh flex-col bg-[var(--bc-surface)]">
      <header className="sticky top-0 z-50 border-b-2 border-[var(--bc-gold)] bg-[var(--bc-blue)] text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <img
              src={withAppBasePath('/logo.png')}
              alt="BC Government logo"
              className="h-11 w-11 shrink-0 object-contain"
            />
            <div className="leading-tight">
              <div className="text-base font-semibold sm:text-lg">Workflow User Portal</div>
            </div>
          </div>

          <NavigationMenu className="ml-6 max-w-none">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <NavLink
                    to="/"
                    end
                    className={({ isActive }) =>
                      isActive
                        ? 'font-semibold !text-white underline decoration-[var(--bc-gold)] decoration-2 underline-offset-8'
                        : '!text-white hover:!text-white'
                    }
                  >
                    Home
                  </NavLink>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <NavLink
                    to="/workflows"
                    className={({ isActive }) =>
                      isActive
                        ? 'font-semibold !text-white underline decoration-[var(--bc-gold)] decoration-2 underline-offset-8'
                        : '!text-white hover:!text-white'
                    }
                  >
                    Workflows
                  </NavLink>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <NavLink
                    to="/workflow-interaction"
                    className={({ isActive }) =>
                      isActive
                        ? 'font-semibold !text-white underline decoration-[var(--bc-gold)] decoration-2 underline-offset-8'
                        : '!text-white hover:!text-white'
                    }
                  >
                    Workflow Interaction
                  </NavLink>
                </NavigationMenuLink>
              </NavigationMenuItem>
              {showAccessRequestLink && (
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <NavLink
                      to="/access-request"
                      className={({ isActive }) =>
                        isActive
                          ? 'font-semibold !text-white underline decoration-[var(--bc-gold)] decoration-2 underline-offset-8'
                          : '!text-white hover:!text-white'
                      }
                    >
                      Access Request
                    </NavLink>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              )}
              {isAdmin && (
                <NavigationMenuItem>
                  <NavigationMenuLink asChild>
                    <NavLink
                      to="/access-requests"
                      className={({ isActive }) =>
                        isActive
                          ? 'font-semibold !text-white underline decoration-[var(--bc-gold)] decoration-2 underline-offset-8'
                          : '!text-white hover:!text-white'
                      }
                    >
                      Review Requests
                    </NavLink>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              )}
            </NavigationMenuList>
          </NavigationMenu>

          <div className="ml-auto flex items-center gap-3">
            {isLoading ? (
              <span className="text-sm text-white/70">Loading...</span>
            ) : user ? (
              <>
                <span className="text-sm text-white/85">{user.email}</span>
                <Button onClick={logout} variant="secondary" size="sm">
                  <IconLogout size={16} aria-hidden="true" />
                  Logout
                </Button>
              </>
            ) : (
              <Button onClick={login} variant="secondary" size="sm">
                <IconLogin2 size={16} aria-hidden="true" />
                Login
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto border-t-2 border-[var(--bc-gold)] bg-[var(--bc-blue)] px-6 py-4 text-center text-xs text-white/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3">
          <span>Disclaimer</span>
          <span>Privacy</span>
          <span>Accessibility</span>
        </div>
      </footer>
    </div>
  );
}
