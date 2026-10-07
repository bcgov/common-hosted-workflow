import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TriggerTargetSection } from '@/components/wil/trigger/trigger-target-section';
import { listTriggerTargets } from '@/services/backend/triggers';
import type { WilTriggerTarget } from '@/services/backend/trigger-types';

vi.mock('@/services/backend/triggers', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/triggers')>('@/services/backend/triggers');
  return { ...actual, listTriggerTargets: vi.fn() };
});

const listMock = vi.mocked(listTriggerTargets);

const target: WilTriggerTarget = {
  workflowId: 'wf1',
  workflowName: 'Approvals',
  projectId: 'p1',
  nodeId: 'n1',
  nodeName: 'WIL Trigger',
  label: 'Approve request',
  description: 'Starts the approval flow',
  acceptedSources: ['button'],
  inputSource: 'workflowInputs',
  inputSchema: [{ name: 'amount', type: 'number' }],
  respondMode: 'immediately',
  responseTimeoutSec: 30,
};

function renderSection(props: Partial<React.ComponentProps<typeof TriggerTargetSection>> = {}) {
  const handlers = { onKindChange: vi.fn(), onTargetChange: vi.fn(), onInputValuesChange: vi.fn() };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TriggerTargetSection
        idPrefix="t"
        tenantId="tenant-1"
        source="button"
        kind="n8n-node"
        workflowId=""
        nodeId=""
        urlFields={<div>legacy url fields</div>}
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

describe('TriggerTargetSection', () => {
  beforeEach(() => {
    listMock.mockReset();
    listMock.mockResolvedValue({ data: [target], enabled: true });
  });

  it('lists workflows and reports the chosen workflow + node', async () => {
    const user = userEvent.setup();
    const handlers = renderSection();

    await screen.findByRole('option', { name: /Approve request/ });
    await user.selectOptions(screen.getByLabelText(/workflow/i), 'wf1/n1');

    expect(handlers.onTargetChange).toHaveBeenCalledWith('wf1', 'n1', target.inputSchema);
  });

  it('shows declared input fields for the selected button target', async () => {
    renderSection({ workflowId: 'wf1', nodeId: 'n1' });
    expect(await screen.findByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByText('Starts the approval flow')).toBeInTheDocument();
  });

  it('explains a saved target that is no longer available', async () => {
    renderSection({ workflowId: 'gone', nodeId: 'n9', savedStatus: 'unpublished' });
    expect(await screen.findByText(/no longer published/i)).toBeInTheDocument();
  });

  it('falls back to URL fields when the backend feature is off', async () => {
    listMock.mockResolvedValue({ data: [], enabled: false });
    renderSection();
    await waitFor(() => expect(screen.getByText('legacy url fields')).toBeInTheDocument());
    expect(screen.queryByText(/Advanced: call a webhook URL/i)).not.toBeInTheDocument();
  });

  it('toggles to the advanced URL mode', async () => {
    const user = userEvent.setup();
    const handlers = renderSection();
    await user.click(await screen.findByRole('button', { name: /Advanced: call a webhook URL/i }));
    expect(handlers.onKindChange).toHaveBeenCalledWith('url');
  });
});
