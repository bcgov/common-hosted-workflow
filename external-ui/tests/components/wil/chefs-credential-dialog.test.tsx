import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChefsCredentialDialog } from '@/components/wil/trigger/chefs-credential-dialog';
import { createChefsCredential, updateChefsCredential } from '@/services/backend/chefs-credentials';

vi.mock('@/services/backend/chefs-credentials', async () => {
  const actual = await vi.importActual<typeof import('@/services/backend/chefs-credentials')>(
    '@/services/backend/chefs-credentials',
  );
  return { ...actual, createChefsCredential: vi.fn(), updateChefsCredential: vi.fn() };
});

const createMock = vi.mocked(createChefsCredential);
const updateMock = vi.mocked(updateChefsCredential);
const TENANT = '717626be-f59f-4e35-ac87-f84c4e11b865';
const SAVED = {
  id: 'cred-1',
  name: 'Intake credential',
  formName: 'Intake',
  formId: 'form-123',
  baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
  scopes: ['credential:read', 'credential:update'],
};

function renderDialog(editing: typeof SAVED | null = null) {
  const onCreated = vi.fn();
  const onUpdated = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ChefsCredentialDialog
        tenantId={TENANT}
        open
        onOpenChange={vi.fn()}
        onCreated={onCreated}
        editing={editing}
        onUpdated={onUpdated}
      />
    </QueryClientProvider>,
  );
  return { onCreated, onUpdated };
}

describe('ChefsCredentialDialog', () => {
  beforeEach(() => {
    createMock.mockReset();
    updateMock.mockReset();
  });

  it('keeps Save disabled until the form is valid, then creates the credential', async () => {
    createMock.mockResolvedValue(SAVED);
    const user = userEvent.setup();
    const { onCreated } = renderDialog();
    const save = screen.getByRole('button', { name: 'Save credential' });

    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText(/Credential name/), 'Intake credential');
    await user.type(screen.getByLabelText(/Form name/), 'Intake');
    await user.type(screen.getByLabelText(/Form ID/), 'form-123');
    await user.type(screen.getByLabelText(/^API key/), 'secret');
    await waitFor(() => expect(save).toBeEnabled());

    await user.click(save);

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(SAVED));
    expect(createMock).toHaveBeenCalledWith({
      tenantId: TENANT,
      input: {
        name: 'Intake credential',
        formName: 'Intake',
        baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
        formId: 'form-123',
        apiKey: 'secret', // pragma: allowlist secret
      },
    });
  });

  it('turns browser autofill off on every field, and asks for no saved password on the API key', () => {
    renderDialog();

    for (const label of [/Credential name/, /Form name/, /CHEFS base URL/, /Form ID/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'off');
    }
    expect(screen.getByLabelText(/^API key/)).toHaveAttribute('autocomplete', 'new-password');
  });

  it('shows the URL error after leaving an invalid base URL', async () => {
    const user = userEvent.setup();
    renderDialog();
    const baseUrl = screen.getByLabelText(/CHEFS base URL/);

    await user.clear(baseUrl);
    await user.type(baseUrl, 'not a url');
    await user.tab();

    expect(await screen.findByText('Enter a valid URL')).toBeInTheDocument();
  });

  it('on edit, omits a blank API key so the stored key is kept', async () => {
    updateMock.mockResolvedValue({ ...SAVED, formName: 'Intake v2' });
    const user = userEvent.setup();
    const { onUpdated } = renderDialog(SAVED);
    const formName = screen.getByLabelText(/Form name/);

    await user.clear(formName);
    await user.type(formName, 'Intake v2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(updateMock.mock.calls[0][0].input.apiKey).toBeUndefined();
    expect(updateMock.mock.calls[0][0].input.formName).toBe('Intake v2');
  });
});
