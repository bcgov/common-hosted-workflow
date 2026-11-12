import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PendingRunRequestPanel } from '@/components/projects/pending-run-request-panel';
import { toast } from '@/hooks/use-toasts';
import { cancelRunRequest, type ProjectItem, type PendingRunRequest } from '@/services/backend/projects';

vi.mock('@/services/backend/projects', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/projects')>('@/services/backend/projects');
  return { ...actual, cancelRunRequest: vi.fn() };
});

vi.mock('@/hooks/use-toasts', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const cancelMock = vi.mocked(cancelRunRequest);
const successToastMock = vi.mocked(toast.success);
const errorToastMock = vi.mocked(toast.error);

const PROJECT: ProjectItem = {
  projectId: 'p-devx',
  projectName: 'DEVX',
  projectType: 'team',
  tenantId: null,
  weeklyRateLimit: 10_000,
  yearlyRateLimit: 500_000,
  stopBehavior: 'hard_stop',
  lastAdminComment: null,
  weeklyExecutionCount: 9_200,
  yearlyExecutionCount: 452_300,
  weeklyTopupRuns: 0,
  yearlyTopupRuns: 0,
  workflowCount: 9,
  membersCount: 14,
  updatedAt: null,
  updatedByName: null,
};

const EXTRA_RUNS_REQUEST: PendingRunRequest = {
  id: '22222222-2222-4222-8222-222222222222',
  requestKind: 'extra_runs',
  extraRuns: 5_000,
  periodKey: '2026-W46',
  requestedWeeklyLimit: null,
  requestedAnnualLimit: null,
  reason: 'Fall intake started early, so Invoice QR intake is running about twice its usual volume this week.',
  requestedBy: 'user-1',
  createdAt: '2026-11-10T18:14:00Z',
};

function renderPanel(
  request: PendingRunRequest = EXTRA_RUNS_REQUEST,
  viewerUserId: string | null = 'user-1',
  project: ProjectItem = PROJECT,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PendingRunRequestPanel project={project} request={request} viewerUserId={viewerUserId} />
    </QueryClientProvider>,
  );
}

describe('PendingRunRequestPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 10:14 AM in Vancouver on 2026-11-10 (the request's createdAt day).
    vi.setSystemTime(new Date('2026-11-10T18:20:00Z'));
    cancelMock.mockReset();
    successToastMock.mockReset();
    errorToastMock.mockReset();
    cancelMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the pending badge, byline, requested text and reason', () => {
    renderPanel();

    expect(screen.getByText('Pending review')).toBeInTheDocument();
    expect(screen.getByText(/Extra runs for one week · sent today at .* by you/)).toBeInTheDocument();
    expect(screen.getByText('You asked for 5,000 extra runs for Nov 9 to 15')).toBeInTheDocument();
    expect(screen.getByText(/Until then, your weekly limit stays at 10,000\./)).toBeInTheDocument();
    expect(screen.getByText('Your reason')).toBeInTheDocument();
    expect(screen.getByText(EXTRA_RUNS_REQUEST.reason)).toBeInTheDocument();
  });

  it('omits "by you" when the viewer did not file the request', () => {
    renderPanel(EXTRA_RUNS_REQUEST, 'someone-else');

    expect(screen.getByText(/Extra runs for one week · sent today at /)).toBeInTheDocument();
    expect(screen.queryByText(/by you/)).not.toBeInTheDocument();
  });

  it('describes a limit-increase request with both limits', () => {
    renderPanel({
      ...EXTRA_RUNS_REQUEST,
      requestKind: 'limit_increase',
      extraRuns: null,
      periodKey: null,
      requestedWeeklyLimit: 12_000,
      requestedAnnualLimit: 600_000,
    });

    expect(screen.getByText(/A higher limit · sent today at .* by you/)).toBeInTheDocument();
    expect(screen.getByText('You asked for a higher limit: 12,000 runs a week and 600,000 a year')).toBeInTheDocument();
    expect(screen.getByText(/Until then, your limits stay at 10,000 a week and 500,000 a year\./)).toBeInTheDocument();
  });

  it('cancels the request and toasts on success', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Cancel request' }));

    await waitFor(() => expect(cancelMock).toHaveBeenCalledWith('p-devx', EXTRA_RUNS_REQUEST.id));
    await waitFor(() => expect(successToastMock).toHaveBeenCalledWith('Request cancelled'));
  });

  it('toasts an error when the request is no longer pending', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    cancelMock.mockRejectedValue(Object.assign(new Error('gone'), { isAxiosError: true, response: { status: 404 } }));
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Cancel request' }));

    await waitFor(() => expect(errorToastMock).toHaveBeenCalledWith('The request is no longer pending'));
  });
});
