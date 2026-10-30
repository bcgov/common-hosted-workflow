import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageTopupsDialog } from '@/components/projects/manage-topups-dialog';
import { toast } from '@/hooks/use-toasts';
import {
  createProjectTopup,
  deleteProjectTopup,
  listProjectTopups,
  type AdminProjectItem,
  type ProjectTopupItem,
  type ProjectTopupsResponse,
} from '@/services/backend/projects';

vi.mock('@/services/backend/projects', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/projects')>('@/services/backend/projects');
  return { ...actual, createProjectTopup: vi.fn(), deleteProjectTopup: vi.fn(), listProjectTopups: vi.fn() };
});

vi.mock('@/hooks/use-toasts', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const createMock = vi.mocked(createProjectTopup);
const deleteMock = vi.mocked(deleteProjectTopup);
const listMock = vi.mocked(listProjectTopups);
const successToastMock = vi.mocked(toast.success);
const errorToastMock = vi.mocked(toast.error);

const PROJECT: AdminProjectItem = {
  projectId: 'p-devx',
  projectName: 'DEVX Tenant',
  projectType: 'team',
  tenantId: null,
  weeklyRateLimit: 12_000,
  yearlyRateLimit: 500_000,
  stopBehavior: 'hard_stop',
  lastAdminComment: 'Tier A pilot limits',
  weeklyExecutionCount: 8_640,
  yearlyExecutionCount: 121_000,
  weeklyTopupRuns: 0,
  workflowCount: 2,
  membersCount: 4,
  updatedAt: '2026-09-02T20:00:00Z',
  updatedByName: 'N. McInnis',
};

function makeTopup(overrides: Partial<ProjectTopupItem> = {}): ProjectTopupItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    projectId: PROJECT.projectId,
    periodKey: '2026-W45',
    amount: 2_000,
    adminComment: 'Quarterly batch',
    createdBy: 'admin@example.com',
    createdAt: '2026-10-27T20:00:00Z',
    ...overrides,
  };
}

function makePage(data: ProjectTopupItem[] = [], page = 1, totalItems = data.length): ProjectTopupsResponse {
  return {
    data,
    pagination: { page, pageSize: 4, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / 4)) },
  };
}

const HISTORY = [
  makeTopup({ id: 'future-later', periodKey: '2026-W46', adminComment: 'Later batch' }),
  makeTopup(),
  makeTopup({ id: 'current', periodKey: '2026-W44', adminComment: 'Current batch' }),
  makeTopup({ id: 'past', periodKey: '2026-W43', adminComment: 'Past batch' }),
];

function renderDialog(project: AdminProjectItem = PROJECT, open = true) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = (nextProject: AdminProjectItem, nextOpen: boolean) => (
    <QueryClientProvider client={client}>
      <ManageTopupsDialog project={nextProject} open={nextOpen} onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
  const result = render(view(project, open));
  return {
    client,
    onOpenChange,
    rerenderDialog: (nextProject = project, nextOpen = true) => result.rerender(view(nextProject, nextOpen)),
  };
}

function commentInput() {
  return screen.getByLabelText(/^Admin comment/);
}

function axiosLikeError(status: number) {
  return Object.assign(new Error('Request failed'), { isAxiosError: true, response: { status } });
}

describe('ManageTopupsDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T20:00:00Z'));
    createMock.mockReset();
    deleteMock.mockReset();
    listMock.mockReset();
    successToastMock.mockReset();
    errorToastMock.mockReset();
    createMock.mockResolvedValue({ success: true, message: 'Top-up added', topup: makeTopup() });
    deleteMock.mockResolvedValue(undefined);
    listMock.mockResolvedValue(makePage());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('seeds the current week, blank inputs and a half-year of week options', async () => {
    renderDialog();

    expect(await screen.findByText('No top-ups yet.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Manage top-ups for DEVX Tenant' })).toBeInTheDocument();
    expect(screen.getByLabelText('Period')).toHaveValue('2026-W44');
    expect(screen.getByLabelText('Top-up amount')).toHaveValue('');
    expect(commentInput()).toHaveValue('');
    expect(commentInput()).toHaveAttribute('maxlength', '2000');
    const options = within(screen.getByLabelText('Period')).getAllByRole('option');
    expect(options).toHaveLength(26);
    expect(options[0]).toHaveTextContent('This week (Oct 26 to Nov 1)');
    expect(options[1]).toHaveTextContent('Nov 2 to 8');
    expect(options[25]).toHaveValue('2027-W16');
    expect(options.every((option) => !option.textContent?.includes('Weekly'))).toBe(true);
    expect(listMock).toHaveBeenCalledWith('p-devx', 1, 4, expect.any(AbortSignal));
    expect(screen.getByText('Weekly limit is 12,000 and annual limit is 500,000.')).toBeInTheDocument();
  });

  it('puts the form actions immediately after the admin comment, above history', async () => {
    renderDialog();
    await screen.findByText('No top-ups yet.');

    const footer = screen.getByRole('button', { name: 'Add top-up' }).parentElement;
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Cancel' }));
    expect(commentInput().closest('div')?.nextElementSibling).toBe(footer);
    expect(footer?.nextElementSibling).toHaveAttribute('data-orientation', 'horizontal');
  });

  it('includes existing current-week top-ups in the limit summary', async () => {
    renderDialog({ ...PROJECT, weeklyTopupRuns: 2_000 });
    await screen.findByText('No top-ups yet.');

    expect(screen.getByText('Weekly limit is 12,000 (+2,000 top-up) and annual limit is 500,000.')).toBeInTheDocument();
  });

  it('warns that top-ups have no effect without a weekly limit', async () => {
    renderDialog({ ...PROJECT, weeklyRateLimit: null, yearlyRateLimit: null, weeklyTopupRuns: 2_000 });
    await screen.findByText('No top-ups yet.');

    expect(
      screen.getByText('No weekly limit is configured, so a top-up would not take effect. Annual limit is not set.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add top-up' })).toBeEnabled();
  });

  it.each(['', '0', '-1', '1.5', 'abc', '1,000,001'])('rejects an invalid amount of "%s"', async (amount) => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText('No top-ups yet.');

    if (amount) await user.type(screen.getByLabelText('Top-up amount'), amount);
    await user.type(commentInput(), 'Approved');
    await user.click(screen.getByRole('button', { name: 'Add top-up' }));

    expect(screen.getByText('Enter a whole number of runs between 1 and 1,000,000')).toBeInTheDocument();
    expect(screen.getByLabelText('Top-up amount')).toHaveAttribute('aria-invalid', 'true');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('requires a non-whitespace admin comment', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText('No top-ups yet.');

    await user.type(screen.getByLabelText('Top-up amount'), '100');
    await user.type(commentInput(), '   ');
    await user.click(screen.getByRole('button', { name: 'Add top-up' }));

    expect(screen.getByText('Admin comment is required')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('adds the parsed payload, refreshes related queries and keeps the chosen week open', async () => {
    const user = userEvent.setup();
    const { client, onOpenChange } = renderDialog();
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    await screen.findByText('No top-ups yet.');

    await user.selectOptions(screen.getByLabelText('Period'), '2026-W45');
    await user.type(screen.getByLabelText('Top-up amount'), '2, 000');
    await user.type(commentInput(), '  Quarterly batch  ');
    await user.click(screen.getByRole('button', { name: 'Add top-up' }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith('p-devx', {
        periodKey: '2026-W45',
        amount: 2_000,
        adminComment: 'Quarterly batch',
      }),
    );
    await waitFor(() => expect(screen.getByLabelText('Top-up amount')).toHaveValue(''));
    expect(commentInput()).toHaveValue('');
    expect(screen.getByLabelText('Period')).toHaveValue('2026-W45');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(successToastMock).toHaveBeenCalledWith('Top-up added');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin-project-topups', 'p-devx'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin-projects'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin-project', 'p-devx'] });
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });

  it('preserves an in-progress entry when the project refetches', async () => {
    const user = userEvent.setup();
    const { rerenderDialog } = renderDialog();
    await screen.findByText('No top-ups yet.');

    await user.selectOptions(screen.getByLabelText('Period'), '2026-W45');
    await user.type(screen.getByLabelText('Top-up amount'), '2,000');
    await user.type(commentInput(), 'In-progress approval');
    rerenderDialog({ ...PROJECT, weeklyTopupRuns: 100 });

    expect(screen.getByLabelText('Period')).toHaveValue('2026-W45');
    expect(screen.getByLabelText('Top-up amount')).toHaveValue('2,000');
    expect(commentInput()).toHaveValue('In-progress approval');
  });

  it('resets inputs, validation and period when reopened', async () => {
    const user = userEvent.setup();
    const { rerenderDialog } = renderDialog();
    await screen.findByText('No top-ups yet.');

    await user.selectOptions(screen.getByLabelText('Period'), '2026-W45');
    await user.type(screen.getByLabelText('Top-up amount'), '0');
    await user.click(screen.getByRole('button', { name: 'Add top-up' }));
    expect(screen.getByText('Admin comment is required')).toBeInTheDocument();
    rerenderDialog(PROJECT, false);
    rerenderDialog(PROJECT, true);

    expect(screen.getByLabelText('Period')).toHaveValue('2026-W44');
    expect(screen.getByLabelText('Top-up amount')).toHaveValue('');
    expect(commentInput()).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders period-ordered history as week ranges and offers removal only for future weeks', async () => {
    listMock.mockResolvedValue(makePage(HISTORY));
    renderDialog();

    await screen.findByText('Past batch');

    expect(screen.getByRole('columnheader', { name: 'Week' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Period' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Ends' })).not.toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[2].textContent)).toEqual([
      'Nov 9 to 15',
      'Nov 2 to 8',
      'Oct 26 to Nov 1',
      'Oct 19 to 25',
    ]);
    // Zebra striping: odd history rows are striped, even rows keep the plain surface.
    expect(rows[0]).not.toHaveClass('bg-surface-subtle');
    expect(rows[1]).toHaveClass('bg-surface-subtle', 'hover:bg-surface-muted');
    expect(rows[2]).not.toHaveClass('bg-surface-subtle');
    expect(rows[3]).toHaveClass('bg-surface-subtle');
    expect(screen.getAllByRole('button', { name: /^Remove top-up for/ })).toHaveLength(2);
    expect(within(rows[0]).getByRole('button', { name: /Nov 9 to 15/ })).toBeInTheDocument();
    expect(within(rows[1]).getByRole('button', { name: /Nov 2 to 8/ })).toBeInTheDocument();
    expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rows[3]).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rows[1]).getByText('+2,000')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Oct 27')).toBeInTheDocument();
  });

  it('requests history pages of four and disables navigation at the edges', async () => {
    const user = userEvent.setup();
    const older = makeTopup({ id: 'older', periodKey: '2026-W42', adminComment: 'Older batch' });
    listMock.mockImplementation(async (_projectId, page) => makePage(page === 1 ? HISTORY : [older], page, 5));
    renderDialog();

    await screen.findByText('Later batch');
    expect(screen.getByText('Showing 4 of 5 top-ups')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByText('Older batch');
    expect(listMock).toHaveBeenCalledWith('p-devx', 2, 4, expect.any(AbortSignal));
    expect(screen.getByText('Showing 1 of 5 top-ups')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Previous' }));

    await screen.findByText('Later batch');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('requires confirmation before deleting a future top-up and refreshes history', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValueOnce(makePage([makeTopup()])).mockResolvedValue(makePage());
    const { onOpenChange } = renderDialog();

    await screen.findByText('Quarterly batch');
    await user.click(screen.getByRole('button', { name: 'Remove top-up for the week of Nov 2 to 8' }));
    const confirmation = screen.getByRole('dialog', { name: 'Remove top-up' });
    expect(
      within(confirmation).getByText('This removes the 2,000-run top-up for the week of Nov 2 to 8.'),
    ).toBeInTheDocument();
    expect(deleteMock).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('p-devx', makeTopup().id));
    await screen.findByText('No top-ups yet.');
    expect(screen.queryByRole('dialog', { name: 'Remove top-up' })).not.toBeInTheDocument();
    expect(successToastMock).toHaveBeenCalledWith('Top-up removed');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('cancels deletion without closing the manager or calling the API', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue(makePage([makeTopup()]));
    const { onOpenChange } = renderDialog();

    await screen.findByText('Quarterly batch');
    await user.click(screen.getByRole('button', { name: /^Remove top-up for/ }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Remove top-up' })).getByRole('button', { name: 'Cancel' }),
    );

    expect(screen.queryByRole('dialog', { name: 'Remove top-up' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Manage top-ups for DEVX Tenant' })).toBeInTheDocument();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows the server conflict when a target week starts before removal', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue(makePage([makeTopup()]));
    deleteMock.mockRejectedValue(axiosLikeError(409));
    renderDialog();

    await screen.findByText('Quarterly batch');
    await user.click(screen.getByRole('button', { name: /^Remove top-up for/ }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Remove top-up' })).getByRole('button', { name: 'Remove' }),
    );

    await waitFor(() =>
      expect(errorToastMock).toHaveBeenCalledWith('Top-ups for the current or past weeks cannot be deleted'),
    );
    expect(screen.getByRole('dialog', { name: 'Remove top-up' })).toBeInTheDocument();
    expect(successToastMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'Invalid top-up'],
    [404, 'Top-up not found'],
    [500, 'Network error'],
  ])('reports an add failure with status %d without losing the entry', async (status, message) => {
    const user = userEvent.setup();
    createMock.mockRejectedValue(axiosLikeError(status));
    const { onOpenChange } = renderDialog();
    await screen.findByText('No top-ups yet.');

    await user.type(screen.getByLabelText('Top-up amount'), '100');
    await user.type(commentInput(), 'Approved');
    await user.click(screen.getByRole('button', { name: 'Add top-up' }));

    await waitFor(() => expect(errorToastMock).toHaveBeenCalledWith(message));
    expect(screen.getByLabelText('Top-up amount')).toHaveValue('100');
    expect(commentInput()).toHaveValue('Approved');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows a history error without disabling the add form', async () => {
    listMock.mockRejectedValue(new Error('Database unavailable'));
    renderDialog();

    expect(await screen.findByText('Could not load top-up history.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add top-up' })).toBeEnabled();
  });

  it('does not load history while closed', () => {
    renderDialog(PROJECT, false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(listMock).not.toHaveBeenCalled();
  });

  it('closes on Cancel without adding or deleting a top-up', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await screen.findByText('No top-ups yet.');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
