import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChefsFormFields, DEFAULT_CHEFS_FORM } from '@/components/wil/trigger/trigger-chefs-form';
import { listChefsCredentials, updateChefsCredential } from '@/services/backend/chefs-credentials';

vi.mock('@/services/backend/chefs-credentials', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/chefs-credentials')>(
    '@/services/backend/chefs-credentials',
  );
  return { ...actual, listChefsCredentials: vi.fn(), createChefsCredential: vi.fn(), updateChefsCredential: vi.fn() };
});

const listMock = vi.mocked(listChefsCredentials);
const updateMock = vi.mocked(updateChefsCredential);

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
    updateMock.mockReset();
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

    await user.click(screen.getByLabelText(/CHEFS credential/i));
    const row = await screen.findByRole('button', { name: /Intake credential.*Intake/ });
    await user.click(row);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        n8nCredentialId: 'cred-1',
        formId: 'form-123',
        formName: 'Intake',
        apiKey: '',
      }),
    );
  });

  it('opens the edit dialog pre-filled from the selected credential and saves changes', async () => {
    const user = userEvent.setup();
    updateMock.mockResolvedValue({
      id: 'cred-1',
      name: 'Intake credential (renamed)',
      formName: 'Intake',
      formId: 'form-123',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
    });
    renderFields();

    await user.click(screen.getByLabelText(/CHEFS credential/i));
    await user.click(await screen.findByRole('button', { name: /Edit Intake credential/i }));

    expect(await screen.findByRole('heading', { name: 'Edit CHEFS credential' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Credential name/i)).toHaveValue('Intake credential');
    expect(screen.getByLabelText(/Form ID/i)).toHaveValue('form-123');
    expect(screen.queryByText('API key *')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Credential name/i));
    await user.type(screen.getByLabelText(/Credential name/i), 'Intake credential (renamed)');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-1',
        input: expect.objectContaining({ name: 'Intake credential (renamed)', apiKey: undefined }),
      }),
    );
  });
});
