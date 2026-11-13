import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminProjectsView } from '@/components/projects/admin-projects-view';
import {
  fetchAllProjects,
  getRateLimitDefaults,
  listAdminRunRequests,
  type AdminRunRequestItem,
  type AdminRunRequestStatusFilter,
  type AdminRunRequestsPage,
  type ProjectItem,
} from '@/services/backend/projects';

vi.mock('@/services/backend/projects', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/projects')>('@/services/backend/projects');
  return { ...actual, fetchAllProjects: vi.fn(), getRateLimitDefaults: vi.fn(), listAdminRunRequests: vi.fn() };
});

const fetchAllMock = vi.mocked(fetchAllProjects);
const getRateLimitDefaultsMock = vi.mocked(getRateLimitDefaults);
const listAdminRunRequestsMock = vi.mocked(listAdminRunRequests);

/** An empty run-requests page (what the stat tile and tab count read when nothing is pending). */
const EMPTY_RUN_REQUESTS_PAGE: AdminRunRequestsPage = {
  data: [],
  pagination: { page: 1, pageSize: 1, totalItems: 0, totalPages: 0 },
  pending: { count: 0, oldestCreatedAt: null },
};

function makeProject(overrides: Partial<ProjectItem> = {}): ProjectItem {
  return {
    projectId: 'p-1',
    projectName: 'Tenant One',
    projectType: 'team',
    tenantId: null,
    weeklyRateLimit: null,
    yearlyRateLimit: null,
    stopBehavior: null,
    lastAdminComment: null,
    weeklyExecutionCount: 0,
    yearlyExecutionCount: 0,
    weeklyTopupRuns: 0,
    yearlyTopupRuns: 0,
    workflowCount: 0,
    membersCount: 0,
    updatedAt: null,
    updatedByName: null,
    ...overrides,
  };
}

const CITZ = makeProject({
  projectId: 'p-citz',
  projectName: 'CITZ Tenant',
  tenantId: '11111111-1111-1111-1111-111111111111',
  weeklyRateLimit: 12_000,
  yearlyRateLimit: 500_000,
  stopBehavior: 'hard_stop',
  weeklyExecutionCount: 12_000,
  yearlyExecutionCount: 60_000,
  workflowCount: 3,
  updatedAt: '2026-09-02T20:00:00Z',
  updatedByName: 'N. McInnis',
});
const CSTAR = makeProject({
  projectId: 'p-cstar',
  projectName: 'CSTAR Tenant',
  tenantId: '22222222-2222-2222-2222-222222222222',
  weeklyRateLimit: 9_500,
  yearlyRateLimit: 1_000_000,
  stopBehavior: 'soft_stop',
  weeklyExecutionCount: 8_640,
  yearlyExecutionCount: 121_000,
  workflowCount: 7,
});
const DEVX = makeProject({
  projectId: 'p-devx',
  projectName: 'DEVX Tenant',
  weeklyExecutionCount: 42,
  yearlyExecutionCount: 500,
  workflowCount: 1,
});
const PERSONAL = makeProject({
  projectId: 'p-personal',
  projectName: 'Jane Doe',
  projectType: 'personal',
  weeklyRateLimit: 100,
  yearlyRateLimit: 5_000,
  stopBehavior: 'hard_stop',
  weeklyExecutionCount: 10,
  yearlyExecutionCount: 200,
  workflowCount: 2,
});

const PROJECTS = [CITZ, CSTAR, DEVX, PERSONAL];

function renderView(initialEntries: string[] = ['/projects'], props: { readOnly?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <AdminProjectsView {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Stat-card value and label live in the same card container as the (unique) caption. */
function statCardText(caption: string): string {
  const captionNode = screen.getByText(caption);
  const card = captionNode.closest('div');
  expect(card).not.toBeNull();
  return card?.textContent ?? '';
}

describe('AdminProjectsView', () => {
  beforeEach(() => {
    fetchAllMock.mockReset();
    fetchAllMock.mockResolvedValue(PROJECTS);
    getRateLimitDefaultsMock.mockReset();
    getRateLimitDefaultsMock.mockResolvedValue({
      team: { weeklyRateLimit: null, yearlyRateLimit: null },
      personal: { weeklyRateLimit: null, yearlyRateLimit: null },
    });
    listAdminRunRequestsMock.mockReset();
    listAdminRunRequestsMock.mockResolvedValue(EMPTY_RUN_REQUESTS_PAGE);
  });

  it('aggregates stat cards over every fetched project', async () => {
    renderView();

    await screen.findByText('CITZ Tenant');

    // 12000 + 8640 + 42 + 10 = 20692 weekly runs across all projects.
    expect(statCardText('3 tenants, 1 personal accounts')).toBe('Runs this week21K3 tenants, 1 personal accounts');
    expect(statCardText('At a weekly or annual limit')).toBe('Limit reached1At a weekly or annual limit');
    expect(statCardText('Close to a weekly or annual limit')).toBe(
      'Near limit (80%+)1Close to a weekly or annual limit',
    );
    expect(statCardText('Nothing waiting')).toBe('Run requests waiting0Nothing waiting');
  });

  it('offers the period selector as a single, current-week option', async () => {
    renderView();

    await screen.findByText('CITZ Tenant');

    const periodSelect = screen.getByLabelText('Period') as HTMLSelectElement;
    expect(periodSelect.options).toHaveLength(1);
    expect(periodSelect.options[0].textContent ?? '').toMatch(/^Period: /);
  });

  it('defaults to the tenants tab and summarizes its statuses', async () => {
    renderView();

    await screen.findByText('CITZ Tenant');

    expect(screen.getByRole('tab', { name: 'Tenants (3)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Personal accounts (1)' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('3 tenants · 1 at limit, 1 near limit, 1 with no limit')).toBeInTheDocument();
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
  });

  it('switches to personal accounts and resummarizes', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole('tab', { name: 'Personal accounts (1)' }));

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.queryByText('CITZ Tenant')).not.toBeInTheDocument();
    expect(screen.getByText('1 personal accounts · 0 at limit, 0 near limit, 0 with no limit')).toBeInTheDocument();
  });

  it('restores the personal tab from the ?tab=personal search param', async () => {
    renderView(['/projects?tab=personal']);

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Personal accounts (1)' })).toHaveAttribute('aria-selected', 'true');
  });

  it('filters rows by search across name, tenant id and project id', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByText('CITZ Tenant');
    await user.type(screen.getByLabelText('Search projects'), 'citz');

    expect(screen.getByText('CITZ Tenant')).toBeInTheDocument();
    expect(screen.queryByText('CSTAR Tenant')).not.toBeInTheDocument();
    expect(screen.getByText('1 tenants · 1 at limit, 0 near limit, 0 with no limit')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search projects'));
    await user.type(screen.getByLabelText('Search projects'), '22222222');

    expect(screen.getByText('CSTAR Tenant')).toBeInTheDocument();
    expect(screen.queryByText('CITZ Tenant')).not.toBeInTheDocument();
  });

  it('filters rows by status', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByText('CITZ Tenant');
    await user.selectOptions(screen.getByLabelText('Filter by status'), 'limit_reached');

    expect(screen.getByText('CITZ Tenant')).toBeInTheDocument();
    expect(screen.queryByText('CSTAR Tenant')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filter by status'), 'no_limit');

    expect(screen.getByText('DEVX Tenant')).toBeInTheDocument();
    expect(screen.queryByText('CITZ Tenant')).not.toBeInTheDocument();
  });

  it('renders usage, bar tone, status badge and links per row', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByText('CITZ Tenant');

    // Reached: red bar, full usage.
    const citzRow = within(screen.getByRole('row', { name: /CITZ Tenant/ }));
    expect(citzRow.getByText('12,000 / 12,000')).toBeInTheDocument();
    expect(citzRow.getByRole('img', { name: '12,000 of 12,000 runs used' })).toHaveAttribute('data-tone', 'red');
    expect(citzRow.getByText('Limit reached')).toBeInTheDocument();

    // Near: amber bar.
    const cstarRow = within(screen.getByRole('row', { name: /CSTAR Tenant/ }));
    expect(cstarRow.getByText('8,640 / 9,500')).toBeInTheDocument();
    expect(cstarRow.getByRole('img', { name: '8,640 of 9,500 runs used' })).toHaveAttribute('data-tone', 'amber');
    expect(cstarRow.getByText('Near limit')).toBeInTheDocument();
    // Workflows column comes straight from the API's workflowCount.
    expect(cstarRow.getByText('7')).toBeInTheDocument();

    // No limit: empty bar, no tone.
    const devxRow = within(screen.getByRole('row', { name: /DEVX Tenant/ }));
    expect(devxRow.getByText('42 / No limit')).toBeInTheDocument();
    const noLimitBar = devxRow.getByRole('img', { name: '42 runs, no limit set' });
    expect(noLimitBar).not.toHaveAttribute('data-tone');
    expect(devxRow.getByText('No limit')).toBeInTheDocument();

    const manageLinks = screen.getAllByRole('link', { name: 'Manage' });
    expect(manageLinks).toHaveLength(3);
    expect(manageLinks[0]).toHaveAttribute('href', '/projects/p-citz');
    expect(screen.getByRole('link', { name: 'CITZ Tenant' })).toHaveAttribute('href', '/projects/p-citz');

    // The personal project renders under its own tab.
    await user.click(screen.getByRole('tab', { name: 'Personal accounts (1)' }));
    const personalRow = within(screen.getByRole('row', { name: /Jane Doe/ }));
    expect(personalRow.getByText('Within limit')).toBeInTheDocument();
  });

  it('uses current-week top-ups for weekly bars, statuses and aggregates only', async () => {
    fetchAllMock.mockResolvedValue([{ ...CITZ, weeklyTopupRuns: 12_000 }, CSTAR, DEVX, PERSONAL]);
    renderView();

    await screen.findByText('CITZ Tenant');

    const citzRow = within(screen.getByRole('row', { name: /CITZ Tenant/ }));
    expect(citzRow.getByText('12,000 / 24,000')).toBeInTheDocument();
    expect(citzRow.getByRole('img', { name: '12,000 of 24,000 runs used' })).toHaveAttribute('data-tone', 'blue');
    expect(citzRow.getByText('Within limit')).toBeInTheDocument();
    expect(citzRow.getByText('60,000 / 500,000')).toBeInTheDocument();
    expect(statCardText('At a weekly or annual limit')).toBe('Limit reached0At a weekly or annual limit');
    expect(screen.getByText('3 tenants · 0 at limit, 1 near limit, 1 with no limit')).toBeInTheDocument();
  });

  it('paginates the filtered rows client-side at 25 per page', async () => {
    const user = userEvent.setup();
    fetchAllMock.mockResolvedValue(
      Array.from({ length: 30 }, (_, index) =>
        makeProject({
          projectId: `p-${String(index).padStart(2, '0')}`,
          projectName: `Tenant ${String(index).padStart(2, '0')}`,
        }),
      ),
    );
    renderView();

    await screen.findByText('Tenant 00');

    expect(screen.getByText('Showing 1–25 of 30 tenants')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Showing 26–30 of 30 tenants')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('opens the default limits dialog and loads the saved defaults', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByText('CITZ Tenant');
    await user.click(screen.getByRole('button', { name: 'Default limits' }));

    expect(await screen.findByRole('group', { name: 'Team projects (tenants)' })).toBeInTheDocument();
    expect(getRateLimitDefaultsMock).toHaveBeenCalledTimes(1);
  });
});

describe('AdminProjectsView in read-only (non-admin) mode', () => {
  beforeEach(() => {
    fetchAllMock.mockReset();
    fetchAllMock.mockResolvedValue(PROJECTS);
    getRateLimitDefaultsMock.mockReset();
    getRateLimitDefaultsMock.mockResolvedValue({
      team: { weeklyRateLimit: null, yearlyRateLimit: null },
      personal: { weeklyRateLimit: null, yearlyRateLimit: null },
    });
  });

  it('hides the default limits control and never loads the defaults', async () => {
    renderView(['/projects'], { readOnly: true });

    await screen.findByText('CITZ Tenant');

    expect(screen.queryByRole('button', { name: 'Default limits' })).not.toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.queryByText('Admin view')).not.toBeInTheDocument();
    expect(getRateLimitDefaultsMock).not.toHaveBeenCalled();
  });

  it('shows the same table with View links into the detail page', async () => {
    renderView(['/projects'], { readOnly: true });

    await screen.findByText('CITZ Tenant');

    expect(screen.getByText('12,000 / 12,000')).toBeInTheDocument();
    const viewLinks = screen.getAllByRole('link', { name: 'View' });
    expect(viewLinks).toHaveLength(3);
    expect(viewLinks[0]).toHaveAttribute('href', '/projects/p-citz');
    expect(screen.queryByRole('link', { name: 'Manage' })).not.toBeInTheDocument();
  });
});

describe('AdminProjectsView run requests tab', () => {
  const EXTRA_RUNS_REQUEST: AdminRunRequestItem = {
    id: 'req-a',
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
    lastTopup: null,
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
    ...EXTRA_RUNS_REQUEST,
    id: 'req-b',
    projectId: 'p-devx',
    projectName: 'DEVX Tenant',
    projectType: 'personal',
    requestKind: 'limit_increase',
    extraRuns: null,
    periodKey: null,
    requestedWeeklyLimit: 20_000,
    requestedAnnualLimit: 800_000,
    reason: 'Automation volume grew past the cap.',
    requestedByName: 'Riley Chen',
    requestedByEmail: 'riley@testapp.com',
    requestedByRoleLabel: 'Admin',
    createdAt: '2026-11-02T20:00:00Z',
    weeklyUsedWhenSent: 11_900,
    yearlyUsedWhenSent: 470_000,
    weeklyUsedNow: 12_400,
    yearlyUsedNow: 480_000,
    lastTopup: null,
  };

  const COUNTS: Record<AdminRunRequestStatusFilter, number> = {
    pending: 2,
    approved: 5,
    denied: 1,
    cancelled: 0,
    all: 8,
  };

  function makePage(items: AdminRunRequestItem[], totalItems: number): AdminRunRequestsPage {
    return {
      data: items,
      pagination: { page: 1, pageSize: 25, totalItems, totalPages: 1 },
      pending: { count: COUNTS.pending, oldestCreatedAt: '2026-11-02T20:00:00Z' },
    };
  }

  function mockRequestsList(items: AdminRunRequestItem[]) {
    listAdminRunRequestsMock.mockImplementation((params) => {
      // Chip counts use pageSize-1 probes per filter; the table uses the real page.
      if (params.pageSize === 1) {
        return Promise.resolve(makePage([], COUNTS[params.status]));
      }
      const search = params.search?.trim().toLowerCase() ?? '';
      const filtered = search
        ? items.filter((item) =>
            `${item.projectName} ${item.requestedByName ?? ''} ${item.requestedByEmail ?? ''}`
              .toLowerCase()
              .includes(search),
          )
        : items;
      return Promise.resolve(makePage(filtered, filtered.length === items.length ? COUNTS[params.status] : 0));
    });
  }

  beforeEach(() => {
    fetchAllMock.mockReset();
    fetchAllMock.mockResolvedValue(PROJECTS);
    getRateLimitDefaultsMock.mockReset();
    getRateLimitDefaultsMock.mockResolvedValue({
      team: { weeklyRateLimit: null, yearlyRateLimit: null },
      personal: { weeklyRateLimit: null, yearlyRateLimit: null },
    });
    listAdminRunRequestsMock.mockReset();
    listAdminRunRequestsMock.mockResolvedValue(EMPTY_RUN_REQUESTS_PAGE);
  });

  it('renders the pending queue with chips, summaries and review rows', async () => {
    mockRequestsList([LIMIT_REQUEST, EXTRA_RUNS_REQUEST]);
    renderView(['/projects?tab=requests']);

    expect(await screen.findByRole('tab', { name: 'Run requests (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pending (2)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Approved (5)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Denied (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelled (0)' })).toBeInTheDocument();
    expect(screen.getByText('2 requests waiting · oldest first')).toBeInTheDocument();

    expect(screen.getByText('CITZ Tenant')).toBeInTheDocument();
    expect(screen.getByText('+3,000 runs')).toBeInTheDocument();
    expect(screen.getByText('Extra runs for Nov 2 to 8')).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText(/Editor · sent /)).toBeInTheDocument();
    expect(screen.getByText('20,000 a week · 800,000 a year')).toBeInTheDocument();
    expect(screen.getByText('Higher limit, now 12,000')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Review' })).toHaveLength(2);
    const pendingBadges = screen.getAllByText('Pending');
    expect(pendingBadges.length).toBeGreaterThanOrEqual(2);
  });

  it('opens the review dialog when a row is clicked', async () => {
    const user = userEvent.setup();
    mockRequestsList([EXTRA_RUNS_REQUEST]);
    renderView(['/projects?tab=requests']);

    await screen.findByText('CITZ Tenant');
    await user.click(screen.getByRole('cell', { name: /CITZ Tenant/ }));

    expect(await screen.findByText("Review CITZ Tenant's request")).toBeInTheDocument();
  });

  it('shows the pending empty state with a path to the other filters', async () => {
    const user = userEvent.setup();
    renderView(['/projects?tab=requests']);

    expect(await screen.findByText('No requests waiting')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See all requests' }));

    expect(await screen.findByText('No all requests yet.')).toBeInTheDocument();
  });

  it('shows the no-match empty state with a clear action', async () => {
    const user = userEvent.setup();
    mockRequestsList([EXTRA_RUNS_REQUEST]);
    renderView(['/projects?tab=requests']);

    await screen.findByText('CITZ Tenant');
    await user.type(screen.getByLabelText('Search run requests'), 'zzz');

    expect(await screen.findByText('No requests match “zzz”')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('CITZ Tenant')).toBeInTheDocument();
  });
});
