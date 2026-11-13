'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
/**
 * The adapter delegates to n8n's credential services so n8n owns permission
 * checks, redaction, validation and audit events.
 */
const vitest_1 = require('vitest');
const n8n_credentials_service_1 = require('../../../src/api/services/n8n-credentials.service');
const errors_1 = require('../../../src/api/utils/errors');
const USER = { id: 'user-1', role: { slug: 'global:member' } };
const BLANK = '__n8n_BLANK_VALUE_test';
const EXISTING = { id: 'cred-1', name: 'Intake', type: 'chefsFormAuth', data: 'enc', shared: [] };
function createAdapter() {
  const credentials = {
    createUnmanagedCredential: vitest_1.vi
      .fn()
      .mockResolvedValue({ id: 'cred-new', name: 'n', type: 't', scopes: ['credential:read'] }),
    prepareUpdateData: vitest_1.vi.fn(async (_user, data) => ({ ...data })),
    createEncryptedData: vitest_1.vi.fn().mockResolvedValue({ id: 'cred-1', data: 'enc2' }),
    update: vitest_1.vi.fn().mockResolvedValue({ ...EXISTING }),
    decrypt: vitest_1.vi.fn().mockResolvedValue({ formId: 'f', apiKey: BLANK }),
    getCredentialScopes: vitest_1.vi.fn().mockResolvedValue(['credential:read', 'credential:update']),
  };
  const finder = {
    findCredentialsForUser: vitest_1.vi.fn().mockResolvedValue([EXISTING]),
    findCredentialForUser: vitest_1.vi.fn().mockResolvedValue(EXISTING),
  };
  const projects = { getProjectWithScope: vitest_1.vi.fn().mockResolvedValue({ id: 'proj-1' }) };
  const events = { emit: vitest_1.vi.fn() };
  const adapter = new n8n_credentials_service_1.N8nCredentialsService(credentials, finder, projects, events, BLANK);
  return { adapter, credentials, finder, projects, events };
}
(0, vitest_1.describe)('N8nCredentialsService', () => {
  (0, vitest_1.it)('lists through n8n finder with the requested scopes', async () => {
    const { adapter, finder } = createAdapter();
    await (0, vitest_1.expect)(adapter.listForUser(USER, ['credential:read'])).resolves.toEqual([EXISTING]);
    (0, vitest_1.expect)(finder.findCredentialsForUser).toHaveBeenCalledWith(USER, ['credential:read']);
  });
  (0, vitest_1.it)('reports project permission from n8n project service', async () => {
    const { adapter, projects } = createAdapter();
    await (0, vitest_1.expect)(adapter.canInProject(USER, 'proj-1', 'credential:create')).resolves.toBe(true);
    projects.getProjectWithScope.mockResolvedValueOnce(null);
    await (0, vitest_1.expect)(adapter.canInProject(USER, 'proj-1', 'credential:create')).resolves.toBe(false);
  });
  (0, vitest_1.it)('creates through n8n and emits credentials-created', async () => {
    const { adapter, credentials, events } = createAdapter();
    const dto = { name: 'Intake', type: 'chefsFormAuth', data: { formId: 'f' }, projectId: 'proj-1' };
    await (0, vitest_1.expect)(adapter.create(USER, dto)).resolves.toEqual({
      id: 'cred-new',
      scopes: ['credential:read'],
    });
    (0, vitest_1.expect)(credentials.createUnmanagedCredential).toHaveBeenCalledWith(dto, USER);
    (0, vitest_1.expect)(events.emit).toHaveBeenCalledWith(
      'credentials-created',
      vitest_1.expect.objectContaining({
        user: USER,
        credentialId: 'cred-new',
        credentialType: 'chefsFormAuth',
        projectId: 'proj-1',
      }),
    );
  });
  (0, vitest_1.it)(
    'updates via prepareUpdateData → createEncryptedData → update and emits credentials-updated',
    async () => {
      const { adapter, credentials, events } = createAdapter();
      const payload = { name: 'Intake', type: 'chefsFormAuth', data: { formId: 'f', apiKey: BLANK } };
      await adapter.update(USER, EXISTING, payload);
      (0, vitest_1.expect)(credentials.prepareUpdateData).toHaveBeenCalledWith(USER, payload, EXISTING);
      (0, vitest_1.expect)(credentials.createEncryptedData).toHaveBeenCalledWith({ id: 'cred-1', ...payload });
      (0, vitest_1.expect)(credentials.update).toHaveBeenCalledWith(
        'cred-1',
        { id: 'cred-1', data: 'enc2' },
        payload.data,
      );
      (0, vitest_1.expect)(events.emit).toHaveBeenCalledWith(
        'credentials-updated',
        vitest_1.expect.objectContaining({ user: USER, credentialId: 'cred-1', credentialType: 'chefsFormAuth' }),
      );
    },
  );
  (0, vitest_1.it)('throws 404 when n8n update finds nothing', async () => {
    const { adapter, credentials } = createAdapter();
    credentials.update.mockResolvedValueOnce(null);
    await (0, vitest_1.expect)(
      adapter.update(USER, EXISTING, { name: 'n', type: 'chefsFormAuth', data: {} }),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
  (0, vitest_1.it)('maps n8n 4xx response errors to AppError with the same status', async () => {
    const { adapter, credentials } = createAdapter();
    credentials.createUnmanagedCredential.mockRejectedValueOnce(
      Object.assign(new Error("You don't have the permissions to save the credential in this project."), {
        httpStatusCode: 403,
      }),
    );
    const err = await adapter
      .create(USER, { name: 'n', type: 'chefsFormAuth', data: {}, projectId: 'proj-1' })
      .catch((e) => e);
    (0, vitest_1.expect)(err).toBeInstanceOf(errors_1.AppError);
    (0, vitest_1.expect)(err).toMatchObject({ statusCode: 403 });
  });
  (0, vitest_1.it)('decrypts with n8n redaction (no raw data flag)', async () => {
    const { adapter, credentials } = createAdapter();
    await (0, vitest_1.expect)(adapter.decryptRedacted(EXISTING)).resolves.toEqual({ formId: 'f', apiKey: BLANK });
    (0, vitest_1.expect)(credentials.decrypt).toHaveBeenCalledWith(EXISTING);
  });
});
