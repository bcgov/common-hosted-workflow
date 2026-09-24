import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChefsFormFields, DEFAULT_CHEFS_FORM } from '@/components/wil/trigger/trigger-chefs-form';
import { listChefsCredentials } from '@/services/backend/chefs-credentials';

vi.mock('@/services/backend/chefs-credentials', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/chefs-credentials')>(
    '@/services/backend/chefs-credentials',
  );
  return { ...actual, listChefsCredentials: vi.fn(), createChefsCredential: vi.fn() };
});

const listMock = vi.mocked(listChefsCredentials);

function renderFields(onChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ChefsFormFields
        tenantId="717626be-f59f-4e35-ac87-f84c4e11b865"
        value={{ ...DEFAULT_CHEFS_FORM, allowedActorsType: 'all', callbackWebhookUrl: 'https://example.com/hook' }}
        onChange={onChange}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isSaving={false}
      />
    </QueryClientProvider>,
  );
  return onChange;
}

describe('ChefsFormFields', () => {
  beforeEach(() => {
    listMock.mockReset();
    listMock.mockResolvedValue([
      {
        id: 'cred-1',
        name: 'Intake credential',
        formName: 'Intake',
        formId: 'form-123',
        baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
      },
    ]);
  });

  it('lists CHEFS credentials and selects one without asking for an API key', async () => {
    const user = userEvent.setup();
    const onChange = renderFields();

    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Intake credential — Intake' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/CHEFS credential/i), 'cred-1');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        n8nCredentialId: 'cred-1',
        formId: 'form-123',
        formName: 'Intake',
        apiKey: '',
      }),
    );
  });
});
