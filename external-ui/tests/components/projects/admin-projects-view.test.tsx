import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminProjectsView } from '@/components/projects/admin-projects-view';
import { fetchAllAdminProjects, type AdminProjectItem } from '@/services/backend/projects';

vi.mock('@/services/backend/projects', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/projects')>('@/services/backend/projects');
  return { ...actual, fetchAllAdminProjects: vi.fn() };
});

const fetchAllMock = vi.mocked(fetchAllAdminProjects);

function makeProject(overrides: Partial<AdminProjectItem> = {}): AdminProjectItem {
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

function renderView(initialEntries: string[] = ['/projects']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <AdminProjectsView />
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
  });

  it('aggregates stat cards over every fetched project', async () => {
    renderView();

    await screen.findByText('CITZ Tenant');

    // 12000 + 8640 + 42 + 10 = 20692 weekly runs across all projects.
    expect(statCardText('3 tenants, 1 personal accounts')).toBe('Runs this week21K3 tenants, 1 personal accounts');
    expect(statCardText('Workflows paused until reset')).toBe('Limit reached1Workflows paused until reset');
    expect(statCardText('Close to a weekly or annual limit')).toBe(
      'Near limit (80%+)1Close to a weekly or annual limit',
    );
    expect(statCardText('Runs are not capped')).toBe('No limit set1Runs are not capped');
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
    expect(statCardText('Workflows paused until reset')).toBe('Limit reached0Workflows paused until reset');
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

  it('keeps the Default limits button inert', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByText('CITZ Tenant');
    await user.click(screen.getByRole('button', { name: 'Default limits' }));

    // The only request ever issued is the single full-list fetch.
    expect(fetchAllMock).toHaveBeenCalledTimes(1);
  });
});
