import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../src/app';
import { sessionState } from '../src/state/session';

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

      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content');
      expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
      expect(screen.getByRole('navigation', { name: 'Legal' })).toBeInTheDocument();
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

      expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
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
