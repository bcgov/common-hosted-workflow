import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DefaultLimitsDialog } from '@/components/projects/default-limits-dialog';
import {
  getRateLimitDefaults,
  updateRateLimitDefaults,
  type ProjectRateLimitDefaults,
} from '@/services/backend/projects';

vi.mock('@/services/backend/projects', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/projects')>('@/services/backend/projects');
  return { ...actual, getRateLimitDefaults: vi.fn(), updateRateLimitDefaults: vi.fn() };
});

const getMock = vi.mocked(getRateLimitDefaults);
const updateMock = vi.mocked(updateRateLimitDefaults);

const SAVED_DEFAULTS: ProjectRateLimitDefaults = {
  team: { weeklyRateLimit: 5_000, yearlyRateLimit: 250_000 },
  personal: { weeklyRateLimit: 2_500, yearlyRateLimit: 100_000 },
};

const NO_DEFAULTS: ProjectRateLimitDefaults = {
  team: { weeklyRateLimit: null, yearlyRateLimit: null },
  personal: { weeklyRateLimit: null, yearlyRateLimit: null },
};

function renderDialog() {
  const onOpenChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DefaultLimitsDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

function teamScope() {
  return within(screen.getByRole('group', { name: 'Team projects (tenants)' }));
}

function personalScope() {
  return within(screen.getByRole('group', { name: 'Personal accounts' }));
}

async function awaitFieldsets() {
  await screen.findByRole('group', { name: 'Team projects (tenants)' });
  screen.getByRole('group', { name: 'Personal accounts' });
}

/** Waits until the seeding effect has applied the saved defaults to both scopes. */
async function awaitSeed() {
  await screen.findByDisplayValue('5,000');
  await screen.findByDisplayValue('2,500');
}

describe('DefaultLimitsDialog', () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
    getMock.mockResolvedValue(SAVED_DEFAULTS);
    updateMock.mockResolvedValue({ success: true, message: 'Default limits updated', defaults: SAVED_DEFAULTS });
  });

  it('seeds both scopes from the saved defaults', async () => {
    renderDialog();
    await awaitSeed();

    expect(teamScope().getByLabelText('Default weekly limit')).toHaveValue('5,000');
    expect(teamScope().getByLabelText('Default annual limit')).toHaveValue('250,000');
    expect(personalScope().getByLabelText('Default weekly limit')).toHaveValue('2,500');
    expect(personalScope().getByLabelText('Default annual limit')).toHaveValue('100,000');
  });

  it('shows blank inputs when no defaults are saved, with no usage counts and no reset action', async () => {
    getMock.mockResolvedValue(NO_DEFAULTS);
    renderDialog();
    await awaitFieldsets();

    expect(teamScope().getByLabelText('Default weekly limit')).toHaveValue('');
    expect(teamScope().getByLabelText('Default annual limit')).toHaveValue('');
    expect(personalScope().getByLabelText('Default weekly limit')).toHaveValue('');
    expect(personalScope().getByLabelText('Default annual limit')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Reset to default' })).not.toBeInTheDocument();
    expect(screen.queryByText(/personal accounts use/)).not.toBeInTheDocument();
  });

  it('saves per-scope limits, sending nulls for cleared fields, and closes', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await awaitSeed();

    await user.clear(teamScope().getByLabelText('Default weekly limit'));
    await user.type(teamScope().getByLabelText('Default weekly limit'), '15,000');
    await user.clear(teamScope().getByLabelText('Default annual limit'));
    await user.clear(personalScope().getByLabelText('Default weekly limit'));
    await user.clear(personalScope().getByLabelText('Default annual limit'));
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));

    await vi.waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        team: { weeklyRateLimit: 15_000, yearlyRateLimit: null },
        personal: { weeklyRateLimit: null, yearlyRateLimit: null },
      }),
    );
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('rejects an annual default below the weekly default, per scope', async () => {
    const user = userEvent.setup();
    renderDialog();
    await awaitSeed();

    await user.clear(teamScope().getByLabelText('Default annual limit'));
    await user.type(teamScope().getByLabelText('Default annual limit'), '1,000');
    await user.clear(personalScope().getByLabelText('Default annual limit'));
    await user.type(personalScope().getByLabelText('Default annual limit'), '500');
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));

    expect(teamScope().getByText('Annual limit must be at least the weekly limit')).toBeInTheDocument();
    expect(personalScope().getByText('Annual limit must be at least the weekly limit')).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('enforces the API bounds for the weekly and annual defaults', async () => {
    const user = userEvent.setup();
    renderDialog();
    await awaitSeed();

    await user.clear(teamScope().getByLabelText('Default weekly limit'));
    await user.type(teamScope().getByLabelText('Default weekly limit'), '1,000,001');
    await user.clear(personalScope().getByLabelText('Default annual limit'));
    await user.type(personalScope().getByLabelText('Default annual limit'), '100,000,001');
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));

    expect(teamScope().getByText('Weekly limit must be 1,000,000 or less')).toBeInTheDocument();
    expect(personalScope().getByText('Annual limit must be 100,000,000 or less')).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects non-numeric input', async () => {
    const user = userEvent.setup();
    renderDialog();
    await awaitSeed();

    await user.clear(teamScope().getByLabelText('Default weekly limit'));
    await user.type(teamScope().getByLabelText('Default weekly limit'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Save defaults' }));

    expect(teamScope().getByText('Enter a whole number')).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('closes without saving on Cancel', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await awaitSeed();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
