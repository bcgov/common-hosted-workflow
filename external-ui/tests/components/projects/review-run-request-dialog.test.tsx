import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReviewRunRequestDialog } from '@/components/projects/review-run-request-dialog';
import { toast } from '@/hooks/use-toasts';
import { approveRunRequest, denyRunRequest, type AdminRunRequestItem } from '@/services/backend/projects';

vi.mock('@/services/backend/projects', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/projects')>('@/services/backend/projects');
  return { ...actual, approveRunRequest: vi.fn(), denyRunRequest: vi.fn() };
});

vi.mock('@/hooks/use-toasts', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const approveMock = vi.mocked(approveRunRequest);
const denyMock = vi.mocked(denyRunRequest);
const successToastMock = vi.mocked(toast.success);

// The dialog pins its date rendering to America/Vancouver; compute the
// expected strings with the same options so the test passes in any TZ/ICU.
const VANCOUVER_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Vancouver',
  month: 'short',
  day: 'numeric',
});
const VANCOUVER_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Vancouver',
  hour: 'numeric',
  minute: '2-digit',
});

function sentAt(iso: string): string {
  const date = new Date(iso);
  return `${VANCOUVER_DATE.format(date)} at ${VANCOUVER_TIME.format(date)}`;
}

function sentStamp(iso: string): string {
  const date = new Date(iso);
  return `${VANCOUVER_DATE.format(date)}, ${VANCOUVER_TIME.format(date)}`;
}

const BASE_REQUEST: AdminRunRequestItem = {
  id: 'req-1',
  projectId: 'p-citz',
  projectName: 'CITZ Tenant',
  projectType: 'team',
  requestKind: 'extra_runs',
  status: 'pending',
  extraRuns: 3_000,
  periodKey: '2026-W45',
  requestedWeeklyLimit: null,
  requestedAnnualLimit: null,
  reason: 'We have a big batch load this week.',
  requestedBy: 'user-1',
  requestedByName: 'Jordan Lee',
  requestedByEmail: 'jordan@testapp.com',
  requestedByRoleLabel: 'Editor',
  createdAt: '2026-11-04T23:52:00Z',
  weeklyUsedWhenSent: 5_000,
  yearlyUsedWhenSent: 120_000,
  weeklyUsedNow: 5_200,
  yearlyUsedNow: 121_500,
  currentWeeklyLimit: 12_000,
  currentAnnualLimit: 500_000,
  lastTopup: { amount: 2_000, periodKey: '2026-W44', createdAt: '2026-11-03T18:14:00Z', createdByName: 'N. McInnis' },
  lastLimitChange: null,
  grantedRuns: null,
  decidedWeeklyLimit: null,
  decidedAnnualLimit: null,
  decisionNote: null,
  decidedBy: null,
  decidedByName: null,
  decidedAt: null,
};

const LIMIT_REQUEST: AdminRunRequestItem = {
  ...BASE_REQUEST,
  id: 'req-2',
  requestKind: 'limit_increase',
  extraRuns: null,
  periodKey: null,
  requestedWeeklyLimit: 20_000,
  requestedAnnualLimit: 800_000,
  lastTopup: null,
  lastLimitChange: { at: '2026-10-01T20:00:00Z', byName: 'N. McInnis' },
};

const DECIDED_REQUEST: AdminRunRequestItem = {
  ...BASE_REQUEST,
  id: 'req-3',
  status: 'approved',
  grantedRuns: 2_000,
  decisionNote: 'Half now; ask again if the load stays high.',
  decidedBy: 'admin-1',
  decidedByName: 'N. McInnis',
  decidedAt: '2026-11-05T19:00:00Z',
};

function renderDialog(request: AdminRunRequestItem = BASE_REQUEST) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReviewRunRequestDialog request={request} open onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(view);
  return { onOpenChange, rerender: (next: AdminRunRequestItem = request) => result.rerender(view(next)) };
}

describe('ReviewRunRequestDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T18:30:00Z')); // Thu Nov 5, 2026, 10:30 AM Vancouver
    approveMock.mockReset();
    denyMock.mockReset();
    successToastMock.mockReset();
    approveMock.mockResolvedValue({ success: true, message: 'Approved', request: BASE_REQUEST });
    denyMock.mockResolvedValue({ success: true, message: 'Denied', request: BASE_REQUEST });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the pending extra-runs review with the asked-for details and usage snapshot', () => {
    renderDialog();

    expect(screen.getByText("Review CITZ Tenant's request")).toBeInTheDocument();
    expect(screen.getByText(`From Jordan Lee (Editor) · sent ${sentAt(BASE_REQUEST.createdAt)}`)).toBeInTheDocument();
    expect(screen.getByText('What they asked for')).toBeInTheDocument();
    expect(screen.getByText('Extra runs for one week')).toBeInTheDocument();
    expect(screen.getByText('3,000 runs')).toBeInTheDocument();
    expect(screen.getByText('Nov 2 to 8 (this week)')).toBeInTheDocument();
    expect(screen.getByText('We have a big batch load this week.')).toBeInTheDocument();
    expect(
      screen.getByText(/approved by N\. McInnis on /),
    ).toHaveTextContent(`approved by N. McInnis on ${sentStamp(BASE_REQUEST.lastTopup.createdAt)}`);
    expect(screen.getByText('CITZ Tenant when Jordan asked')).toBeInTheDocument();
    expect(screen.getByText(`${sentStamp(BASE_REQUEST.createdAt)}. Now 5,200 this week (43%)`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve 3,000 runs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open CITZ Tenant project page' })).toHaveAttribute(
      'href',
      '/projects/p-citz',
    );
  });

  it('approves the asked amount by default and toasts what was granted', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Approve 3,000 runs' }));

    await waitFor(() => expect(approveMock).toHaveBeenCalledTimes(1));
    expect(approveMock).toHaveBeenCalledWith('req-1', { grantedRuns: 3_000, note: undefined });
    await waitFor(() =>
      expect(successToastMock).toHaveBeenCalledWith(
        'Approved · CITZ Tenant gets 3,000 extra runs for Nov 2 to 8. We emailed Jordan Lee.',
      ),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('accepts a lowered grant, with a note, and toasts the granted amount', async () => {
    const user = userEvent.setup();
    renderDialog();

    const grantInput = screen.getByLabelText('Runs to grant');
    await user.clear(grantInput);
    await user.type(grantInput, '1,500');
    await user.type(screen.getByLabelText(/Note to Jordan/), 'Half for now.');
    expect(screen.getByText('Weekly limit for Nov 2 to 8')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve 1,500 runs' }));

    await waitFor(() => expect(approveMock).toHaveBeenCalledWith('req-1', { grantedRuns: 1_500, note: 'Half for now.' }));
    await waitFor(() =>
      expect(successToastMock).toHaveBeenCalledWith(
        'Approved · CITZ Tenant gets 1,500 extra runs for Nov 2 to 8. We emailed Jordan Lee.',
      ),
    );
  });

  it('rejects grants below the floor or above the ask', async () => {
    const user = userEvent.setup();
    renderDialog();

    const grantInput = screen.getByLabelText('Runs to grant');
    await user.clear(grantInput);
    await user.type(grantInput, '50');
    await user.click(screen.getByRole('button', { name: 'Approve 50 runs' }));

    expect(
      screen.getByText('Enter a whole number of at least 100 runs, or choose Deny'),
    ).toBeInTheDocument();
    expect(approveMock).not.toHaveBeenCalled();

    await user.clear(grantInput);
    await user.type(grantInput, '9,000');
    await user.click(screen.getByRole('button', { name: 'Approve 9,000 runs' }));

    expect(screen.getByText('Runs to grant cannot be above the 3,000 asked for')).toBeInTheDocument();
    expect(approveMock).not.toHaveBeenCalled();
  });

  it('requires a deny reason of at least 10 characters and denies with the exact text', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByLabelText('Deny'));
    expect(screen.getByLabelText('Reason for denying')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Reason for denying'), 'Too short');
    await user.click(screen.getByRole('button', { name: 'Deny request' }));

    expect(
      screen.getByText('Tell Jordan why, so they know what to change before asking again.'),
    ).toBeInTheDocument();
    expect(denyMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Reason for denying'), ' until usage drops');
    await user.click(screen.getByRole('button', { name: 'Deny request' }));

    await waitFor(() => expect(denyMock).toHaveBeenCalledWith('req-1', { reason: 'Too short until usage drops' }));
    await waitFor(() =>
      expect(successToastMock).toHaveBeenCalledWith(
        'Denied · Jordan will see your reason on the project page and in the email.',
      ),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('reviews a limit increase with prefilled limits and approves both', async () => {
    const user = userEvent.setup();
    renderDialog(LIMIT_REQUEST);

    expect(screen.getByText('A higher limit')).toBeInTheDocument();
    expect(screen.getByText('20,000 asked, now 12,000')).toBeInTheDocument();
    expect(screen.getByText('800,000 asked, now 500,000')).toBeInTheDocument();
    expect(screen.getByLabelText('New weekly limit')).toHaveValue('20,000');
    expect(screen.getByLabelText('New annual limit')).toHaveValue('800,000');
    expect(
      screen.getByText(/Limits set /),
    ).toHaveTextContent(`Limits set ${sentStamp(LIMIT_REQUEST.lastLimitChange.at)} by N. McInnis`);

    await user.click(screen.getByRole('button', { name: 'Approve 20,000 a week and 800,000 a year' }));

    await waitFor(() =>
      expect(approveMock).toHaveBeenCalledWith('req-2', {
        newWeeklyLimit: 20_000,
        newAnnualLimit: 800_000,
        note: undefined,
      }),
    );
    await waitFor(() =>
      expect(successToastMock).toHaveBeenCalledWith(
        "Approved · CITZ Tenant's weekly limit goes to 20,000 and its annual limit goes to 800,000. We emailed Jordan Lee.",
      ),
    );
  });

  it('blocks approving a limit increase at or below the current values', async () => {
    const user = userEvent.setup();
    renderDialog(LIMIT_REQUEST);

    const weeklyInput = screen.getByLabelText('New weekly limit');
    await user.clear(weeklyInput);
    await user.type(weeklyInput, '10,000');
    await user.click(screen.getByRole('button', { name: /Approve/ }));

    expect(screen.getByText('The new weekly limit cannot be lower than the current 12,000')).toBeInTheDocument();
    expect(approveMock).not.toHaveBeenCalled();

    await user.clear(weeklyInput);
    await user.type(weeklyInput, '12,000');
    const annualInput = screen.getByLabelText('New annual limit');
    await user.clear(annualInput);
    await user.type(annualInput, '500,000');
    await user.click(screen.getByRole('button', { name: 'Approve 12,000 a week and 500,000 a year' }));

    expect(screen.getByText('Grant at least one limit above the current values, or deny the request')).toBeInTheDocument();
    expect(approveMock).not.toHaveBeenCalled();
  });

  it('shows the recorded decision read-only for a decided request', () => {
    renderDialog(DECIDED_REQUEST);

    expect(screen.getByText('Decision')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === `${sentAt(DECIDED_REQUEST.decidedAt!)} by N. McInnis`),
    ).toBeInTheDocument();
    expect(screen.getByText('2,000 extra runs (of the 3,000 asked for)')).toBeInTheDocument();
    expect(screen.getByText('Half now; ask again if the load stays high.')).toBeInTheDocument();
    // The X close plus the footer Close of the read-only panel.
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reason for denying')).not.toBeInTheDocument();
  });
});
