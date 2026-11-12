import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestMoreRunsDialog } from '@/components/projects/request-more-runs-dialog';
import { toast } from '@/hooks/use-toasts';
import { createRunRequest, type ProjectItem, type PendingRunRequest } from '@/services/backend/projects';

vi.mock('@/services/backend/projects', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/projects')>('@/services/backend/projects');
  return { ...actual, createRunRequest: vi.fn() };
});

vi.mock('@/hooks/use-toasts', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const createMock = vi.mocked(createRunRequest);
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

function makePendingRequest(overrides: Partial<PendingRunRequest> = {}): PendingRunRequest {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    requestKind: 'extra_runs',
    extraRuns: 5_000,
    periodKey: '2026-W46',
    requestedWeeklyLimit: null,
    requestedAnnualLimit: null,
    reason: 'Fall intake started early',
    requestedBy: 'user-1',
    createdAt: '2026-11-10T18:14:00Z',
    ...overrides,
  };
}

function renderDialog(project: ProjectItem = PROJECT) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = (
    <QueryClientProvider client={client}>
      <RequestMoreRunsDialog project={project} open onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
  const result = render(view);
  return { onOpenChange, rerender: (next: ProjectItem = project) => result.rerender(view(next)) };
}

function axiosLikeError(status: number) {
  return Object.assign(new Error('Request failed'), { isAxiosError: true, response: { status } });
}

describe('RequestMoreRunsDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T18:00:00Z'));
    createMock.mockReset();
    successToastMock.mockReset();
    errorToastMock.mockReset();
    createMock.mockResolvedValue({ success: true, message: 'Run request submitted', request: makePendingRequest() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the usage summary and defaults to the extra-runs mode', () => {
    renderDialog();

    expect(screen.getByText('Request more runs for DEVX')).toBeInTheDocument();
    expect(screen.getByText('DEVX right now')).toBeInTheDocument();
    expect(screen.getByText('9,200')).toBeInTheDocument();
    expect(screen.getByText('452,300')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Extra runs for one week/ })).toBeChecked();
    expect(screen.getByLabelText(/How many extra runs\?/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Which week\?/)).toBeInTheDocument();
  });

  it('switches to the higher-limit mode with the weekly and annual inputs', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDialog();

    await user.click(screen.getByRole('radio', { name: /A higher limit/ }));

    expect(screen.getByLabelText(/New weekly limit/)).toBeInTheDocument();
    expect(screen.getByLabelText(/New annual limit/)).toBeInTheDocument();
    expect(screen.getByText('Now 10,000 runs a week.')).toBeInTheDocument();
    expect(screen.getByText('Now 500,000 runs a year.')).toBeInTheDocument();
  });

  it('shows the approved total for the extra runs against the effective weekly limit', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDialog();

    await user.type(screen.getByLabelText(/How many extra runs\?/), '5,000');

    expect(screen.getByText('If approved: up to 15,000 runs for Nov 9 to 15')).toBeInTheDocument();
    expect(
      screen.getByText(/That is your 10,000 weekly limit plus the 5,000 you asked for/),
    ).toBeInTheDocument();
  });

  it('requires a reason and shows the field error', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDialog();

    await user.type(screen.getByLabelText(/How many extra runs\?/), '5,000');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText('A reason is required')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('sends the extra-runs request and closes with a success toast', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onOpenChange } = renderDialog();

    await user.type(screen.getByLabelText(/How many extra runs\?/), '5,000');
    await user.type(screen.getByLabelText(/Why do you need them\?/), 'Fall intake started early');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith(
      'p-devx',
      expect.objectContaining({
        requestKind: 'extra_runs',
        extraRuns: 5_000,
        reason: 'Fall intake started early',
      }),
    );
    await waitFor(() => expect(successToastMock).toHaveBeenCalledWith("Request sent. We'll email you when an admin decides."));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('sends a limit-increase request with only the changed limits', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDialog();

    await user.click(screen.getByRole('radio', { name: /A higher limit/ }));
    await user.type(screen.getByLabelText(/New weekly limit/), '12,000');
    await user.type(screen.getByLabelText(/Why do you need a higher limit\?/), 'Three new ministries in January');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith(
      'p-devx',
      expect.objectContaining({
        requestKind: 'limit_increase',
        requestedWeeklyLimit: 12_000,
        requestedAnnualLimit: null,
        reason: 'Three new ministries in January',
      }),
    );
  });

  it('surfaces a duplicate-pending 409 as a form error instead of a toast', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createMock.mockRejectedValue(axiosLikeError(409));
    renderDialog();

    await user.type(screen.getByLabelText(/How many extra runs\?/), '5,000');
    await user.type(screen.getByLabelText(/Why do you need them\?/), 'Fall intake started early');
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText('This project already has a request waiting for review.')).toBeInTheDocument();
    expect(successToastMock).not.toHaveBeenCalled();
  });

  it('disables sending while a request is already pending for the project', () => {
    renderDialog({ ...PROJECT, pendingRunRequest: makePendingRequest() });

    expect(screen.getByText(/You already have a request waiting for review/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
  });
});
