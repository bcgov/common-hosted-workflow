import { StrictMode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionBootstrap } from '../src/auth/session-bootstrap';
import { APP_AUTH_TOKEN_STORAGE_KEY } from '../src/services/backend/axios';
import { sessionState } from '../src/state/session';

const { exchangeSessionMock, getSessionMock } = vi.hoisted(() => ({
  exchangeSessionMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock('../src/services/backend/auth', () => ({
  exchangeSession: exchangeSessionMock,
  getSession: getSessionMock,
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

describe('SessionBootstrap', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    sessionState.session = null;
    sessionState.isLoading = false;
    exchangeSessionMock.mockReset();
    getSessionMock.mockReset();
    globalThis.history.replaceState({}, '', '/ui?session=session-123');
  });

  it('deduplicates session exchange in StrictMode and stores the token', async () => {
    exchangeSessionMock.mockResolvedValue({ token: 'app-token-123' });
    getSessionMock.mockResolvedValue({
      authenticated: true,
      user: { subject: 'sub-1', email: 'user@example.com' },
      oidc: {
        issuer: 'https://issuer.example.com',
        subject: 'sub-1',
        audience: ['ui'],
        email: 'user@example.com',
        claims: {},
      },
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
      },
    });

    render(
      <StrictMode>
        <QueryClientProvider client={createQueryClient()}>
          <SessionBootstrap>
            <div>child</div>
          </SessionBootstrap>
        </QueryClientProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(exchangeSessionMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(globalThis.localStorage.getItem(APP_AUTH_TOKEN_STORAGE_KEY)).toBe('app-token-123');
    });

    expect(new URL(globalThis.location.href).searchParams.get('session')).toBeNull();
  });
});
