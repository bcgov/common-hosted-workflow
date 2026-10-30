import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectDetailView } from '@/components/projects/project-detail-view';
import {
  deleteProjectTenant,
  getAdminProject,
  getProjectWorkflowUsage,
  listProjectTopups,
  updateProjectTenant,
  type AdminProjectItem,
  type ProjectWorkflowUsage,
} from '@/services/backend/projects';

vi.mock('@/services/backend/projects', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/projects')>('@/services/backend/projects');
  return {
    ...actual,
    getAdminProject: vi.fn(),
    getProjectWorkflowUsage: vi.fn(),
    listProjectTopups: vi.fn(),
    updateProjectTenant: vi.fn(),
    deleteProjectTenant: vi.fn(),
    updateProjectRateLimit: vi.fn(),
  };
});

const getProjectMock = vi.mocked(getAdminProject);
const getUsageMock = vi.mocked(getProjectWorkflowUsage);
const listTopupsMock = vi.mocked(listProjectTopups);
const updateTenantMock = vi.mocked(updateProjectTenant);
const deleteTenantMock = vi.mocked(deleteProjectTenant);

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

function makeProject(overrides: Partial<AdminProjectItem> = {}): AdminProjectItem {
  return {
    projectId: 'p-devx',
    projectName: 'DEVX Tenant',
    projectType: 'team',
    tenantId: TENANT_ID,
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
    ...overrides,
  };
}

const USAGE: ProjectWorkflowUsage = {
  projectId: 'p-devx',
  weeklyPeriodKey: '2026-W44',
  yearlyPeriodKey: '2026',
  workflows: [
    { workflowId: 'wf-1', workflowName: 'Invoice QR intake', weeklyCount: 2_850, yearlyCount: 121_000 },
    { workflowId: 'wf-2', workflowName: 'Nightly sync', weeklyCount: 5_790, yearlyCount: 28_500 },
  ],
};

function axiosLikeError(status: number) {
  return Object.assign(new Error('Request failed'), {
    isAxiosError: true,
    response: { status },
  });
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/projects/p-devx']}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDetailView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProjectDetailView', () => {
  beforeEach(() => {
    getProjectMock.mockReset();
    getUsageMock.mockReset();
    listTopupsMock.mockReset();
    updateTenantMock.mockReset();
    deleteTenantMock.mockReset();
    getProjectMock.mockResolvedValue(makeProject());
    getUsageMock.mockResolvedValue(USAGE);
    listTopupsMock.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 4, totalItems: 0, totalPages: 1 },
    });
    updateTenantMock.mockResolvedValue(undefined);
    deleteTenantMock.mockResolvedValue(undefined);
  });

  it('renders breadcrumb, limit cards and the workflows table', async () => {
    renderView();

    await screen.findByText('Invoice QR intake');

    const breadcrumb = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(breadcrumb.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    // The list-type crumb (Tenants / Personal accounts) was dropped: only the
    // project name follows the Projects link.
    expect(breadcrumb.queryByText('Tenants')).not.toBeInTheDocument();
    expect(breadcrumb.getByText('DEVX Tenant')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'DEVX Tenant' })).toBeInTheDocument();

    expect(screen.getByText(TENANT_ID)).toBeInTheDocument();
    expect(screen.getByText('2 workflows')).toBeInTheDocument();
    expect(screen.getByText('4 members')).toBeInTheDocument();

    // Weekly limit card.
    expect(screen.getByText('Weekly limit')).toBeInTheDocument();
    expect(screen.getAllByText('8,640').length).toBeGreaterThan(0);
    expect(screen.getByText('of 12,000 runs')).toBeInTheDocument();
    expect(screen.getByText('72% used')).toBeInTheDocument();
    expect(screen.getAllByText(/Resets /)).toHaveLength(2);
    expect(screen.getAllByText('Changed Sep 2 by N. McInnis')).toHaveLength(2);

    // Annual limit card.
    expect(screen.getByText('Annual limit')).toBeInTheDocument();
    expect(screen.getByText('of 500,000 runs')).toBeInTheDocument();

    expect(screen.getAllByText('When reached: pause new runs')).toHaveLength(2);
    expect(screen.queryByText(/Includes \+/)).not.toBeInTheDocument();

    // Workflows table.
    expect(screen.getByRole('heading', { name: 'Workflows (2)' })).toBeInTheDocument();
    expect(screen.getByText('Invoice QR intake')).toBeInTheDocument();
    expect(screen.getByText('ID wf-1')).toBeInTheDocument();
    expect(screen.getByText('Nightly sync')).toBeInTheDocument();
    expect(screen.getByText('2,850')).toBeInTheDocument();
    expect(screen.getByText('5,790')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2 workflows')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Manage top-ups' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit tenant limits' })).toBeInTheDocument();
  });

  it('shows the same Projects-only breadcrumb for personal projects', async () => {
    getProjectMock.mockResolvedValue(makeProject({ projectType: 'personal' }));

    renderView();

    await screen.findByText('Invoice QR intake');

    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(breadcrumb.querySelectorAll('a')).toHaveLength(1);
    expect(breadcrumb.textContent).toBe('Projects/DEVX Tenant');
  });

  it('hides the usage banner while usage is comfortably within limits', async () => {
    renderView();

    await screen.findByText('Invoice QR intake');

    expect(screen.queryByText(/has used \d+% of its/)).not.toBeInTheDocument();
  });

  it('shows the near-limit banner with no current-week top-up', async () => {
    getProjectMock.mockResolvedValue(makeProject({ weeklyExecutionCount: 11_520 }));

    renderView();

    expect(await screen.findByText('DEVX Tenant has used 96% of its weekly limit')).toBeInTheDocument();
    expect(screen.getByText('Top-up: none this week')).toBeInTheDocument();
  });

  it('shows top-ups only on the weekly card and uses the effective weekly limit', async () => {
    getProjectMock.mockResolvedValue(makeProject({ weeklyExecutionCount: 13_440, weeklyTopupRuns: 2_000 }));

    renderView();

    expect(await screen.findByText('DEVX Tenant has used 96% of its weekly limit')).toBeInTheDocument();
    expect(screen.getByText('of 14,000 runs')).toBeInTheDocument();
    expect(screen.getByText('of 500,000 runs')).toBeInTheDocument();
    expect(screen.getAllByText('Includes +2,000 top-up')).toHaveLength(1);
    expect(screen.getByText('Top-up: +2,000 runs this week')).toBeInTheDocument();
  });

  it('explains that reached hard-stop limits pause new runs', async () => {
    getProjectMock.mockResolvedValue(makeProject({ weeklyExecutionCount: 12_000 }));

    renderView();

    expect(await screen.findByText(/New runs pause until the limit resets/)).toBeInTheDocument();
  });

  it('explains that soft-stop limits keep running', async () => {
    getProjectMock.mockResolvedValue(makeProject({ weeklyExecutionCount: 12_000, stopBehavior: 'soft_stop' }));

    renderView();

    expect(await screen.findByText(/Runs continue and admins are alerted/)).toBeInTheDocument();
  });

  it('renders the 404 state for unknown projects', async () => {
    getProjectMock.mockRejectedValue(axiosLikeError(404));

    renderView();

    expect(await screen.findByRole('heading', { name: 'Project not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to projects' })).toHaveAttribute('href', '/projects');
  });

  it('saves a valid tenant id through the inline editor', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Invoice QR intake');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const input = screen.getByLabelText('Tenant ID');
    expect(input).toHaveValue(TENANT_ID);

    const newTenantId = '99999999-9999-9999-9999-999999999999';
    await user.clear(input);
    await user.type(input, newTenantId);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateTenantMock).toHaveBeenCalledWith('p-devx', newTenantId));
    await waitFor(() => expect(screen.queryByLabelText('Tenant ID')).not.toBeInTheDocument());
  });

  it('rejects a malformed tenant id without calling the API', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Invoice QR intake');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const input = screen.getByLabelText('Tenant ID');
    await user.clear(input);
    await user.type(input, 'not-a-uuid');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Invalid UUID format')).toBeInTheDocument();
    expect(updateTenantMock).not.toHaveBeenCalled();
  });

  it('asks for confirmation before removing the tenant mapping', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Invoice QR intake');
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    await user.clear(screen.getByLabelText('Tenant ID'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Remove tenant mapping')).toBeInTheDocument();
    expect(deleteTenantMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(deleteTenantMock).toHaveBeenCalledWith('p-devx'));
  });

  it('opens the edit-limits dialog from the header button', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Invoice QR intake');
    await user.click(screen.getByRole('button', { name: 'Edit tenant limits' }));

    expect(screen.getByText('Edit limits for DEVX Tenant')).toBeInTheDocument();
    expect(screen.getByText('Limits count every run of every workflow in this project.')).toBeInTheDocument();
  });

  it('opens the top-up manager from the header button', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Invoice QR intake');
    expect(listTopupsMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Manage top-ups' }));

    expect(screen.getByRole('dialog', { name: 'Manage top-ups for DEVX Tenant' })).toBeInTheDocument();
    expect(await screen.findByText('No top-ups yet.')).toBeInTheDocument();
    expect(listTopupsMock).toHaveBeenCalledWith('p-devx', 1, 4, expect.any(AbortSignal));
  });
});
