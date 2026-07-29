import { useEffect, useState } from 'react';
import { IconLogin2, IconLogout, IconMenu2, IconX } from '@tabler/icons-react';
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
    'relative flex min-h-11 items-center rounded-control px-3 py-2 text-[0.8125rem] font-bold text-white no-underline transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-accent',
    isActive && 'after:absolute after:right-3 after:bottom-0 after:left-3 after:h-0.75 after:bg-accent',
  );
}

function AppHeader({ navItems, userEmail, isLoading, onLogin, onLogout }: Readonly<AppHeaderProps>) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

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
    <header className="sticky top-0 z-40 border-b-3 border-accent bg-primary text-white shadow-sm">
      <a
        href="#main-content"
        className="fixed top-2 left-2 z-50 -translate-y-24 rounded-control bg-surface px-3 py-2 font-bold text-primary shadow-dialog transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        Skip to main content
      </a>

      <div className="mx-auto flex min-h-15 w-full max-w-[80rem] items-center gap-3 px-4 sm:px-6">
        <Link
          to="/"
          aria-label="Workflow User Portal home"
          className="flex shrink-0 items-center gap-3 text-white no-underline hover:text-white focus-visible:outline-accent"
        >
          <img
            src={withAppBasePath('/figma-assets/navbar-image-2.png')}
            srcSet={`${withAppBasePath('/figma-assets/navbar-image-2.png')} 1x, ${withAppBasePath('/figma-assets/bc-gov-logo.png')} 2x`}
            alt="Government of British Columbia"
            className="h-[1.9375rem] w-20 shrink-0 object-contain"
          />
          <span className="hidden text-base leading-5 font-bold whitespace-nowrap sm:inline">Workflow User Portal</span>
        </Link>

        <nav aria-label="Main" className="ml-auto lg:ml-5 lg:flex lg:min-w-0 lg:flex-1">
          <ul className="hidden min-w-0 list-none items-center gap-0.5 p-0 lg:flex">
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
            className="text-white hover:bg-white/10 hover:text-white focus-visible:outline-accent lg:hidden"
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
            className="absolute top-full right-0 left-0 border-b-3 border-accent bg-primary px-4 py-3 shadow-dialog lg:hidden"
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
              <span className="hidden max-w-48 truncate text-xs text-white/90 xl:inline" title={userEmail}>
                {userEmail}
              </span>
              <Button
                type="button"
                onClick={onLogout}
                variant="secondary"
                size="sm"
                aria-label="Log out"
                className="focus-visible:outline-accent"
              >
                <IconLogout className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Log out</span>
                <span className="sr-only sm:hidden">Log out</span>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={onLogin}
              variant="secondary"
              size="sm"
              aria-label="Sign in"
              className="focus-visible:outline-accent"
            >
              <IconLogin2 className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign in</span>
              <span className="sr-only sm:hidden">Sign in</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export { AppHeader };
export type { AppNavItem };
