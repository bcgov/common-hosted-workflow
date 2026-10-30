import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EditRateLimitsDialog } from '@/components/projects/edit-rate-limits-dialog';
import { updateProjectRateLimit, type AdminProjectItem } from '@/services/backend/projects';

vi.mock('@/services/backend/projects', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/projects')>('@/services/backend/projects');
  return { ...actual, updateProjectRateLimit: vi.fn() };
});

const updateMock = vi.mocked(updateProjectRateLimit);

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

function renderDialog(project: AdminProjectItem = PROJECT) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EditRateLimitsDialog project={project} open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

function weeklyInput() {
  return screen.getByLabelText('Weekly limit');
}

function annualInput() {
  return screen.getByLabelText('Annual limit');
}

describe('EditRateLimitsDialog', () => {
  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockResolvedValue({
      success: true,
      message: 'Rate limit updated',
      rateLimit: {
        projectId: PROJECT.projectId,
        weeklyRateLimit: PROJECT.weeklyRateLimit,
        yearlyRateLimit: PROJECT.yearlyRateLimit,
        lastAdminComment: PROJECT.lastAdminComment,
        stopBehavior: 'hard_stop',
        createdAt: '2026-09-02T20:00:00Z',
        updatedAt: '2026-10-27T00:00:00Z',
      },
    });
  });

  it('seeds the form from the stored configuration', () => {
    renderDialog();

    expect(weeklyInput()).toHaveValue('12,000');
    expect(annualInput()).toHaveValue('500,000');
    expect(screen.getByRole('radio', { name: 'Pause new runs until the limit resets' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Keep running and alert admins (soft limit)' })).not.toBeChecked();
    expect(screen.getByText('Last change')).toBeInTheDocument();
    expect(screen.getByText('Sep 2 by N. McInnis')).toBeInTheDocument();
    expect(screen.getByText('Tier A pilot limits')).toBeInTheDocument();
  });

  it('omits the last-change box when limits were never configured', () => {
    renderDialog({
      ...PROJECT,
      updatedAt: null,
      updatedByName: null,
      lastAdminComment: null,
      stopBehavior: null,
      weeklyRateLimit: null,
      yearlyRateLimit: null,
    });

    expect(screen.queryByText('Last change')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pause new runs until the limit resets' })).toBeChecked();
  });

  it('warns when the typed weekly limit is below current usage', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(weeklyInput());
    expect(screen.queryByText('DEVX Tenant has used 8,640 runs this week')).not.toBeInTheDocument();

    await user.type(weeklyInput(), '5,000');
    expect(screen.getByText('DEVX Tenant has used 8,640 runs this week')).toBeInTheDocument();
    expect(
      screen.getByText('If the new weekly limit is lower than that, DEVX Tenant workflows pause right away.'),
    ).toBeInTheDocument();

    await user.clear(weeklyInput());
    await user.type(weeklyInput(), '20,000');
    expect(screen.queryByText('DEVX Tenant has used 8,640 runs this week')).not.toBeInTheDocument();
  });

  it('rejects an annual limit below the weekly limit', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(weeklyInput());
    await user.type(weeklyInput(), '10,000');
    await user.clear(annualInput());
    await user.type(annualInput(), '5,000');
    await user.type(screen.getByLabelText(/Reason for change/), 'Adjusting');
    await user.click(screen.getByRole('button', { name: 'Save limits' }));

    expect(screen.getByText('Annual limit must be at least the weekly limit')).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('requires a reason for every change', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/Reason for change/), ' ');
    await user.click(screen.getByRole('button', { name: 'Save limits' }));

    expect(screen.getByText('Reason for change is required')).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects non-numeric limits', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(weeklyInput());
    await user.type(weeklyInput(), 'abc');
    await user.type(screen.getByLabelText(/Reason for change/), 'Adjusting');
    await user.click(screen.getByRole('button', { name: 'Save limits' }));

    expect(screen.getByText('Enter a whole number')).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('enforces the API bounds for both limits', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(weeklyInput());
    await user.type(weeklyInput(), '1,000,001');
    await user.clear(annualInput());
    await user.type(annualInput(), '100,000,001');
    await user.type(screen.getByLabelText(/Reason for change/), 'Adjusting');
    await user.click(screen.getByRole('button', { name: 'Save limits' }));

    expect(screen.getByText('Weekly limit must be 1,000,000 or less')).toBeInTheDocument();
    expect(screen.getByText('Annual limit must be 100,000,000 or less')).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('saves the parsed payload with the chosen stop behavior and closes', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.clear(weeklyInput());
    await user.type(weeklyInput(), '10,000');
    await user.clear(annualInput());
    await user.type(annualInput(), '200,000');
    await user.click(screen.getByRole('radio', { name: 'Keep running and alert admins (soft limit)' }));
    await user.type(screen.getByLabelText(/Reason for change/), 'Annual adjustment ');
    await user.click(screen.getByRole('button', { name: 'Save limits' }));

    await vi.waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('p-devx', {
        weeklyRateLimit: 10_000,
        yearlyRateLimit: 200_000,
        lastAdminComment: 'Annual adjustment',
        stopBehavior: 'soft_stop',
      }),
    );
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('sends nulls for cleared limits', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(weeklyInput());
    await user.clear(annualInput());
    await user.type(screen.getByLabelText(/Reason for change/), 'Removing limits');
    await user.click(screen.getByRole('button', { name: 'Save limits' }));

    await vi.waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('p-devx', {
        weeklyRateLimit: null,
        yearlyRateLimit: null,
        lastAdminComment: 'Removing limits',
        stopBehavior: 'hard_stop',
      }),
    );
  });

  it('closes without saving on Cancel', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
