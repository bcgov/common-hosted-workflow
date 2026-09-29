/**
 * The adapter delegates to n8n's credential services so n8n owns permission
 * checks, redaction, validation and audit events.
 */
import { describe, expect, it, vi } from 'vitest';

import { N8nCredentialsService } from '../../../src/api/services/n8n-credentials.service';
import { AppError } from '../../../src/api/utils/errors';

const USER = { id: 'user-1', role: { slug: 'global:member' } };
const BLANK = '__n8n_BLANK_VALUE_test';
const EXISTING = { id: 'cred-1', name: 'Intake', type: 'chefsFormAuth', data: 'enc', shared: [] };

function createAdapter() {
  const credentials = {
    createUnmanagedCredential: vi
      .fn()
      .mockResolvedValue({ id: 'cred-new', name: 'n', type: 't', scopes: ['credential:read'] }),
    prepareUpdateData: vi.fn(async (_user, data) => ({ ...data })),
    createEncryptedData: vi.fn().mockResolvedValue({ id: 'cred-1', data: 'enc2' }),
    update: vi.fn().mockResolvedValue({ ...EXISTING }),
    decrypt: vi.fn().mockResolvedValue({ formId: 'f', apiKey: BLANK }),
    getCredentialScopes: vi.fn().mockResolvedValue(['credential:read', 'credential:update']),
  };
  const finder = {
    findCredentialsForUser: vi.fn().mockResolvedValue([EXISTING]),
    findCredentialForUser: vi.fn().mockResolvedValue(EXISTING),
  };
  const projects = { getProjectWithScope: vi.fn().mockResolvedValue({ id: 'proj-1' }) };
  const events = { emit: vi.fn() };
  const adapter = new N8nCredentialsService(credentials, finder, projects, events, BLANK);
  return { adapter, credentials, finder, projects, events };
}

describe('N8nCredentialsService', () => {
  it('lists through n8n finder with the requested scopes', async () => {
    const { adapter, finder } = createAdapter();
    await expect(adapter.listForUser(USER, ['credential:read'])).resolves.toEqual([EXISTING]);
    expect(finder.findCredentialsForUser).toHaveBeenCalledWith(USER, ['credential:read']);
  });

  it('reports project permission from n8n project service', async () => {
    const { adapter, projects } = createAdapter();
    await expect(adapter.canInProject(USER, 'proj-1', 'credential:create')).resolves.toBe(true);
    projects.getProjectWithScope.mockResolvedValueOnce(null);
    await expect(adapter.canInProject(USER, 'proj-1', 'credential:create')).resolves.toBe(false);
  });

  it('creates through n8n and emits credentials-created', async () => {
    const { adapter, credentials, events } = createAdapter();
    const dto = { name: 'Intake', type: 'chefsFormAuth', data: { formId: 'f' }, projectId: 'proj-1' };

    await expect(adapter.create(USER, dto)).resolves.toEqual({ id: 'cred-new', scopes: ['credential:read'] });
    expect(credentials.createUnmanagedCredential).toHaveBeenCalledWith(dto, USER);
    expect(events.emit).toHaveBeenCalledWith(
      'credentials-created',
      expect.objectContaining({
        user: USER,
        credentialId: 'cred-new',
        credentialType: 'chefsFormAuth',
        projectId: 'proj-1',
      }),
    );
  });

  it('updates via prepareUpdateData → createEncryptedData → update and emits credentials-updated', async () => {
    const { adapter, credentials, events } = createAdapter();
    const payload = { name: 'Intake', type: 'chefsFormAuth', data: { formId: 'f', apiKey: BLANK } };

    await adapter.update(USER, EXISTING, payload);

    expect(credentials.prepareUpdateData).toHaveBeenCalledWith(USER, payload, EXISTING);
    expect(credentials.createEncryptedData).toHaveBeenCalledWith({ id: 'cred-1', ...payload });
    expect(credentials.update).toHaveBeenCalledWith('cred-1', { id: 'cred-1', data: 'enc2' }, payload.data);
    expect(events.emit).toHaveBeenCalledWith(
      'credentials-updated',
      expect.objectContaining({ user: USER, credentialId: 'cred-1', credentialType: 'chefsFormAuth' }),
    );
  });

  it('throws 404 when n8n update finds nothing', async () => {
    const { adapter, credentials } = createAdapter();
    credentials.update.mockResolvedValueOnce(null);
    await expect(adapter.update(USER, EXISTING, { name: 'n', type: 'chefsFormAuth', data: {} })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('maps n8n 4xx response errors to AppError with the same status', async () => {
    const { adapter, credentials } = createAdapter();
    credentials.createUnmanagedCredential.mockRejectedValueOnce(
      Object.assign(new Error("You don't have the permissions to save the credential in this project."), {
        httpStatusCode: 403,
      }),
    );
    const err = await adapter
      .create(USER, { name: 'n', type: 'chefsFormAuth', data: {}, projectId: 'proj-1' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 403 });
  });

  it('decrypts with n8n redaction (no raw data flag)', async () => {
    const { adapter, credentials } = createAdapter();
    await expect(adapter.decryptRedacted(EXISTING)).resolves.toEqual({ formId: 'f', apiKey: BLANK });
    expect(credentials.decrypt).toHaveBeenCalledWith(EXISTING);
  });
});
