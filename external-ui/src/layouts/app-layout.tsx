import { NavLink } from 'react-router';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/auth-context';
import { withAppBasePath } from '../config/base-path';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, isLoading, login, logout } = useAuth();

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

          <nav className="ml-6 flex items-center gap-4 text-sm font-medium">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive
                  ? 'font-semibold !text-white visited:!text-white underline decoration-[var(--bc-gold)] decoration-2 underline-offset-8'
                  : '!text-white visited:!text-white hover:!text-white'
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/workflows"
              className={({ isActive }) =>
                isActive
                  ? 'font-semibold !text-white visited:!text-white underline decoration-[var(--bc-gold)] decoration-2 underline-offset-8'
                  : '!text-white visited:!text-white hover:!text-white'
              }
            >
              Workflows
            </NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {isLoading ? (
              <span className="text-sm text-white/70">Loading...</span>
            ) : user ? (
              <>
                <span className="text-sm text-white/85">{user.profile.email}</span>
                <button
                  onClick={logout}
                  className="rounded bg-white px-4 py-2 text-sm font-semibold text-[var(--bc-blue-dark)] shadow-sm hover:bg-white/90"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={login}
                className="rounded bg-white px-4 py-2 text-sm font-semibold text-[var(--bc-blue-dark)] shadow-sm hover:bg-white/90"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto border-t-2 border-[var(--bc-gold)] bg-[var(--bc-blue)] px-6 py-4 text-center text-xs text-white/80">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-6">
          <span>Disclaimer</span>
          <span>Privacy</span>
          <span>Accessibility</span>
        </div>
      </footer>
    </div>
  );
}
