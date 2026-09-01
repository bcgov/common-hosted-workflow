import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../src/app';
import { sessionState } from '../src/state/session';
import { openN8n } from '../src/auth/session-actions';

vi.mock('../src/state/session', () => ({
  sessionState: {
    session: null,
    isLoading: false,
  },
  useSession: () => sessionState.session,
  useAuthUser: () => sessionState.session?.user ?? null,
  usePermissions: () => sessionState.session?.permissions ?? null,
  useSessionLoading: () => sessionState.isLoading,
}));

vi.mock('../src/services/backend/auth', () => ({
  getSession: vi.fn(),
  getWhoami: vi.fn(),
}));

vi.mock('../src/auth/session-actions', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  openN8n: vi.fn(),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Session-driven navigation/gating', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sessionState.session = null;
    sessionState.isLoading = false;
  });

  describe('AccessRequestRoute', () => {
    it('redirects to home when canRequestAccess is false', () => {
      sessionState.session = {
        user: { subject: 'sub-1', email: 'user@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'user@example.com',
          disabled: false,
          role: { slug: 'global:member', displayName: 'Member' },
        },
        permissions: {
          isAdmin: false,
          canRequestAccess: false,
          canReviewAccessRequests: false,
          canShareWorkflows: true,
          canUnshareWorkflows: false,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/access-request']}>
          <App />
        </MemoryRouter>,
      );

      expect(screen.queryByText('Request Access')).not.toBeInTheDocument();
    });

    it('renders AccessRequest when canRequestAccess is true', () => {
      sessionState.session = {
        user: { subject: 'sub-1', email: 'user@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'user@example.com',
          disabled: false,
          role: null,
        },
        permissions: {
          isAdmin: false,
          canRequestAccess: true,
          canReviewAccessRequests: false,
          canShareWorkflows: false,
          canUnshareWorkflows: false,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/access-request']}>
          <App />
        </MemoryRouter>,
      );

      expect(screen.getByText('Request Access')).toBeInTheDocument();
    });
  });

  describe('Navigation links', () => {
    it('shows Access Request link when canRequestAccess is true', () => {
      sessionState.session = {
        user: { subject: 'sub-1', email: 'user@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'user@example.com',
          disabled: false,
          role: null,
        },
        permissions: {
          isAdmin: false,
          canRequestAccess: true,
          canReviewAccessRequests: false,
          canShareWorkflows: false,
          canUnshareWorkflows: false,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      const nav = screen.getByRole('navigation', { name: 'Main' });
      expect(nav).toHaveTextContent('Access Request');
    });

    it('hides Access Request link when canRequestAccess is false', () => {
      sessionState.session = {
        user: { subject: 'sub-1', email: 'user@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'user@example.com',
          disabled: false,
          role: { slug: 'global:member', displayName: 'Member' },
        },
        permissions: {
          isAdmin: false,
          canRequestAccess: false,
          canReviewAccessRequests: false,
          canShareWorkflows: true,
          canUnshareWorkflows: false,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      expect(screen.queryByText('Access Request')).not.toBeInTheDocument();
    });

    it('shows Review Requests link when canReviewAccessRequests is true', () => {
      sessionState.session = {
        user: { subject: 'sub-1', email: 'admin@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'admin@example.com',
          disabled: false,
          role: { slug: 'global:admin', displayName: 'Admin' },
        },
        permissions: {
          isAdmin: true,
          canRequestAccess: false,
          canReviewAccessRequests: true,
          canShareWorkflows: true,
          canUnshareWorkflows: true,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      const nav = screen.getByRole('navigation', { name: 'Main' });
      expect(nav).toHaveTextContent('Review Requests');
    });

    it('hides Review Requests link when canReviewAccessRequests is false', () => {
      sessionState.session = {
        user: { subject: 'sub-1', email: 'user@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'user@example.com',
          disabled: false,
          role: { slug: 'global:member', displayName: 'Member' },
        },
        permissions: {
          isAdmin: false,
          canRequestAccess: true,
          canReviewAccessRequests: false,
          canShareWorkflows: true,
          canUnshareWorkflows: false,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      expect(screen.queryByText('Review Requests')).not.toBeInTheDocument();
    });

    it('shows sign in button and accessible shell when not authenticated', () => {
      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      const signInButtons = screen.getAllByRole('button', { name: /sign in/i });
      expect(signInButtons.length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByRole('button', { name: 'Open n8n' })).not.toBeInTheDocument();
      expect(signInButtons[0]).toHaveClass('w-[4.5rem]', 'sm:w-20');
      expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
      expect(screen.getByRole('navigation', { name: 'Legal' })).toBeInTheDocument();
    });

    it('hides open n8n when not authenticated', () => {
      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      expect(screen.queryByRole('button', { name: 'Open n8n' })).not.toBeInTheDocument();
      expect(openN8n).not.toHaveBeenCalled();
    });

    it('hides open n8n while the session is loading', () => {
      sessionState.isLoading = true;

      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      expect(screen.queryByRole('button', { name: 'Open n8n' })).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Loading session');
      const header = screen.getAllByRole('banner')[0];
      expect(within(header).queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
      expect(within(header).queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
    });

    it('shows log out button when authenticated', () => {
      sessionState.session = {
        user: { subject: 'sub-1', email: 'user@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'user@example.com',
          disabled: false,
          role: { slug: 'global:member', displayName: 'Member' },
        },
        permissions: {
          isAdmin: false,
          canRequestAccess: false,
          canReviewAccessRequests: false,
          canShareWorkflows: true,
          canUnshareWorkflows: false,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      const logoutButton = screen.getByRole('button', { name: 'Log out' });
      expect(logoutButton).toHaveTextContent('Log out');
      expect(screen.getByRole('button', { name: 'Open n8n' })).toBeInTheDocument();
      expect(logoutButton.querySelector('svg')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
    });

    it('opens n8n from the header when authenticated', async () => {
      const user = userEvent.setup();
      sessionState.session = {
        user: { subject: 'sub-1', email: 'user@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'user@example.com',
          disabled: false,
          role: { slug: 'global:member', displayName: 'Member' },
        },
        permissions: {
          isAdmin: false,
          canRequestAccess: false,
          canReviewAccessRequests: false,
          canShareWorkflows: true,
          canUnshareWorkflows: false,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      await user.click(screen.getByRole('button', { name: 'Open n8n' }));

      expect(openN8n).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    });

    it('hides open n8n for a disabled n8n user', () => {
      sessionState.session = {
        user: { subject: 'sub-1', email: 'user@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'user@example.com',
          disabled: true,
          role: { slug: 'global:member', displayName: 'Member' },
        },
        permissions: {
          isAdmin: false,
          canRequestAccess: false,
          canReviewAccessRequests: false,
          canShareWorkflows: true,
          canUnshareWorkflows: false,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      expect(screen.queryByRole('button', { name: 'Open n8n' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    });

    it('hides open n8n for a role-less access-request user', () => {
      sessionState.session = {
        user: { subject: 'sub-1', email: 'user@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'user@example.com',
          disabled: false,
          role: null,
        },
        permissions: {
          isAdmin: false,
          canRequestAccess: true,
          canReviewAccessRequests: false,
          canShareWorkflows: false,
          canUnshareWorkflows: false,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      expect(screen.queryByRole('button', { name: 'Open n8n' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    });

    it.each([
      ['global:owner' as const, 'Owner'],
      ['global:admin' as const, 'Admin'],
      ['global:member' as const, 'Member'],
    ])('shows open n8n for enabled user with %s role and invokes openN8n', async (slug, displayName) => {
      const user = userEvent.setup();
      sessionState.session = {
        user: { subject: 'sub-1', email: 'user@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'user@example.com',
          disabled: false,
          role: { slug, displayName },
        },
        permissions: {
          isAdmin: slug !== 'global:member',
          canRequestAccess: false,
          canReviewAccessRequests: false,
          canShareWorkflows: true,
          canUnshareWorkflows: false,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      const button = screen.getByRole('button', { name: 'Open n8n' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('w-[4.5rem]', 'sm:w-20');
      await user.click(button);
      expect(openN8n).toHaveBeenCalledOnce();
      vi.mocked(openN8n).mockClear();
    });

    it('shows open n8n for enabled user even when custom UI feature flags are disabled', async () => {
      const user = userEvent.setup();
      sessionState.session = {
        user: { subject: 'sub-1', email: 'user@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'user@example.com',
          disabled: false,
          role: { slug: 'global:member', displayName: 'Member' },
        },
        permissions: {
          isAdmin: false,
          canRequestAccess: false,
          canReviewAccessRequests: false,
          canShareWorkflows: false,
          canUnshareWorkflows: false,
          canViewWorkflows: false,
          isCstarTenantProjectSyncEnabled: false,
          canManageWil: false,
          canManageProject: false,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      const button = screen.getByRole('button', { name: 'Open n8n' });
      expect(button).toBeInTheDocument();
      await user.click(button);
      expect(openN8n).toHaveBeenCalledOnce();
      // Verify visibility is independent of feature flags: workflows nav is hidden but n8n remains
      expect(screen.queryByText('Workflows')).not.toBeInTheDocument();
    });

    it('does not show Home in the top navigation', () => {
      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    });

    it('centers an empty desktop menu', () => {
      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      expect(screen.getByRole('navigation', { name: 'Main' })).toHaveClass('xl:justify-center');
    });

    it('adds the hover underline treatment only to inactive links', () => {
      sessionState.session = {
        user: { subject: 'sub-1', email: 'user@example.com' },
        oidc: null,
        n8nUser: {
          id: 'user-1',
          email: 'user@example.com',
          disabled: false,
          role: null,
        },
        permissions: {
          isAdmin: false,
          canRequestAccess: true,
          canReviewAccessRequests: false,
          canShareWorkflows: false,
          canUnshareWorkflows: false,
        },
      };

      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      expect(screen.getByRole('link', { name: 'Access Request' })).toHaveClass(
        'hover:underline',
        'hover:decoration-2',
        'hover:decoration-white/70',
      );
    });

    it('opens and closes the responsive main menu', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>,
      );

      const menuButton = screen.getByRole('button', { name: 'Open main menu' });
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');

      await user.click(menuButton);
      expect(screen.getByRole('button', { name: 'Close main menu' })).toHaveAttribute('aria-expanded', 'true');

      await user.keyboard('{Escape}');
      expect(screen.getByRole('button', { name: 'Open main menu' })).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
