import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ButtonTriggerFields, DEFAULT_BUTTON } from '@/components/wil/trigger/trigger-button-form';
import { listTriggerTargets } from '@/services/backend/triggers';
import type { ButtonTriggerPayload } from '@/services/backend/trigger-types';

vi.mock('@/services/backend/triggers', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/triggers')>('@/services/backend/triggers');
  return { ...actual, listTriggerTargets: vi.fn() };
});

const listMock = vi.mocked(listTriggerTargets);

/** Stateful host, like the real form pane, so a lost update would show up in the rendered UI. */
function Host({ initial }: Readonly<{ initial: ButtonTriggerPayload }>) {
  const [value, setValue] = useState(initial);
  return (
    <ButtonTriggerFields
      tenantId="t1"
      value={value}
      onChange={setValue}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      isSaving={false}
    />
  );
}

describe('ButtonTriggerFields workflow selection', () => {
  beforeEach(() => {
    listMock.mockResolvedValue({
      enabled: true,
      data: [
        {
          workflowId: 'wf1',
          workflowName: 'Approvals',
          projectId: 'p1',
          nodeId: 'n1',
          nodeName: 'WIL Trigger',
          label: 'Approve request',
          description: '',
          acceptedSources: ['button'],
          inputSource: 'workflowInputs',
          inputSchema: [{ name: 'amount', type: 'number' }],
          respondMode: 'immediately',
          responseTimeoutSec: 30,
        },
      ],
    });
  });

  it('keeps the selected workflow and shows its input fields', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Host initial={{ ...DEFAULT_BUTTON, allowedActorsType: 'all', allowedActors: '*' }} />
      </QueryClientProvider>,
    );

    await screen.findByRole('option', { name: /Approve request/ });
    const select = screen.getByLabelText(/^workflow/i) as HTMLSelectElement;
    await user.selectOptions(select, 'wf1/n1');

    expect(select.value).toBe('wf1/n1');
    expect(await screen.findByLabelText(/amount/i)).toBeInTheDocument();
  });
});
