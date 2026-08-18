import { useEffect, useState } from 'react';
import { IconMenu2, IconX } from '@tabler/icons-react';
import { Link, NavLink, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { withAppBasePath } from '@/config/base-path';
import { cn } from '@/lib/utils';

interface AppNavItem {
  label: string;
  to: string;
  end?: boolean;
}

interface AppHeaderProps {
  navItems: AppNavItem[];
  userEmail?: string;
  isLoading: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

function navLinkClassName({ isActive }: { isActive: boolean }) {
  return cn(
    'relative flex min-h-11 items-center rounded-control px-3.5 py-2 text-sm font-normal text-white no-underline transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-accent xl:min-w-[6.375rem] xl:justify-center',
    isActive &&
      'rounded-b-none bg-white/15 font-bold after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.75 after:bg-accent',
    !isActive && 'hover:underline hover:decoration-2 hover:decoration-white/70 hover:underline-offset-[0.375rem]',
  );
}

const shellActionClassName =
  'h-[2.125rem] min-h-0 w-20 border-white/30 bg-white/10 px-0 py-0 text-[0.8125rem] leading-none font-normal text-white shadow-none hover:bg-white/15 hover:text-white active:bg-white/20 focus-visible:outline-accent';

function AppHeader({ navItems, userEmail, isLoading, onLogin, onLogout }: Readonly<AppHeaderProps>) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const hasSingleNavItem = navItems.length === 1;

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    }

    globalThis.addEventListener('keydown', closeOnEscape);
    return () => globalThis.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-0 z-40 box-border h-16 border-b-3 border-accent bg-primary text-white shadow-sm">
      <a
        href="#main-content"
        className="fixed top-2 left-2 z-50 -translate-y-24 rounded-control bg-surface px-3 py-2 font-bold text-primary shadow-dialog transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        Skip to main content
      </a>

      <div className="mx-auto flex h-full w-full max-w-[80rem] items-center gap-3 px-4 sm:px-6 xl:px-0">
        <Link
          to="/"
          aria-label="Workflow User Portal home"
          className="flex shrink-0 items-center gap-3 text-white no-underline hover:text-white focus-visible:outline-accent"
        >
          <img
            src={withAppBasePath('/figma-assets/navbar-image-2.png')}
            alt="Government of British Columbia"
            className="h-10 w-[100px] shrink-0 object-contain aspect-[80/31]"
          />
          <span className="hidden text-base leading-[1.375rem] font-bold whitespace-nowrap sm:inline">
            Workflow User Portal
          </span>
        </Link>

        <nav
          aria-label="Main"
          className={cn(
            'ml-auto xl:flex xl:min-w-0 xl:flex-1',
            hasSingleNavItem ? 'xl:ml-20 xl:justify-start' : 'xl:justify-center',
          )}
        >
          <ul className="hidden min-w-0 translate-y-[1.5px] list-none items-center gap-1 p-0 xl:flex">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className={navLinkClassName}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-main-menu"
            aria-label={mobileMenuOpen ? 'Close main menu' : 'Open main menu'}
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="text-white hover:bg-white/10 hover:text-white focus-visible:outline-accent xl:hidden"
          >
            {mobileMenuOpen ? (
              <IconX className="size-5" aria-hidden="true" />
            ) : (
              <IconMenu2 className="size-5" aria-hidden="true" />
            )}
          </Button>

          <div
            id="mobile-main-menu"
            hidden={!mobileMenuOpen}
            className="absolute top-full right-0 left-0 max-h-[calc(100svh-4rem)] overflow-y-auto border-t border-white/20 border-b-3 border-b-accent bg-primary px-4 py-3 shadow-dialog xl:hidden"
          >
            <ul className="mx-auto grid max-w-content list-none gap-1 p-0">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={navLinkClassName}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {isLoading ? (
            <span className="hidden text-xs text-white/80 xl:inline" role="status">
              Loading session…
            </span>
          ) : userEmail ? (
            <>
              <span
                className="hidden max-w-48 truncate text-[0.8125rem] leading-[1.125rem] text-white/80 xl:inline"
                title={userEmail}
              >
                {userEmail}
              </span>
              <Button
                type="button"
                onClick={onLogout}
                variant="ghost"
                size="sm"
                aria-label="Log out"
                className={shellActionClassName}
              >
                Log out
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={onLogin}
              variant="ghost"
              size="sm"
              aria-label="Sign in"
              className={shellActionClassName}
            >
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export { AppHeader };
export type { AppNavItem };
