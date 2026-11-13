'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
/**
 * CHEFS credential list/create/update/bind go through n8n's credential
 * services; ChefsService only adds the CHEFS type and tenant filters.
 */
const vitest_1 = require('vitest');
vitest_1.vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    CHEFS_BASE_URL: 'https://submit.digital.gov.bc.ca',
    CHEFS_GATEWAY_URL: 'https://submit.digital.gov.bc.ca/app/gateway/v1',
    CHEFS_ALLOWED_ORIGINS: ['https://chefs-dev.example'],
  };
});
const chefs_service_1 = require('../../../src/api/services/chefs.service');
const USER = { id: 'user-1', role: { slug: 'global:member' } };
const BLANK = '__n8n_BLANK_VALUE_test';
const TENANT_PROJECTS = ['proj-1', 'proj-2'];
function credential(id, projectId, type = 'chefsFormAuth') {
  return { id, name: `Cred ${id}`, type, data: 'enc', shared: [{ projectId, role: 'credential:owner' }] };
}
function createService() {
  const n8nCredentials = {
    blankingValue: BLANK,
    listForUser: vitest_1.vi
      .fn()
      .mockResolvedValue([
        credential('cred-1', 'proj-1'),
        credential('cred-other-tenant', 'proj-9'),
        credential('cred-wrong-type', 'proj-1', 'httpBasicAuth'),
      ]),
    findForUser: vitest_1.vi.fn().mockResolvedValue(credential('cred-1', 'proj-1')),
    canInProject: vitest_1.vi.fn().mockResolvedValue(true),
    create: vitest_1.vi.fn().mockResolvedValue({ id: 'cred-new', scopes: ['credential:read', 'credential:update'] }),
    update: vitest_1.vi.fn().mockResolvedValue(undefined),
    decryptRedacted: vitest_1.vi.fn().mockResolvedValue({
      formId: 'form-123',
      formName: 'Intake',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
      apiKey: BLANK,
    }),
    scopesFor: vitest_1.vi.fn().mockResolvedValue(['credential:read']),
  };
  const service = new chefs_service_1.ChefsService({}, {}, n8nCredentials);
  return { service, n8nCredentials };
}
(0, vitest_1.describe)('ChefsService.listFormCredentials', () => {
  (0, vitest_1.it)('lists readable CHEFS credentials in the tenant with scopes and no API key', async () => {
    const { service, n8nCredentials } = createService();
    const result = await service.listFormCredentials(USER, TENANT_PROJECTS);
    (0, vitest_1.expect)(n8nCredentials.listForUser).toHaveBeenCalledWith(USER, ['credential:read']);
    (0, vitest_1.expect)(result.credentials).toEqual([
      {
        id: 'cred-1',
        name: 'Cred cred-1',
        formName: 'Intake',
        formId: 'form-123',
        baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
        scopes: ['credential:read'],
      },
    ]);
    (0, vitest_1.expect)(JSON.stringify(result)).not.toContain(BLANK);
  });
  (0, vitest_1.it)('excludes credentials outside the tenant and of other types', async () => {
    const { service } = createService();
    const result = await service.listFormCredentials(USER, TENANT_PROJECTS);
    (0, vitest_1.expect)(result.credentials.map((c) => c.id)).toEqual(['cred-1']);
  });
  (0, vitest_1.it)('reports canCreate from n8n credential:create on the tenant project', async () => {
    const { service, n8nCredentials } = createService();
    n8nCredentials.canInProject.mockResolvedValueOnce(false);
    const result = await service.listFormCredentials(USER, TENANT_PROJECTS);
    (0, vitest_1.expect)(n8nCredentials.canInProject).toHaveBeenCalledWith(USER, 'proj-1', 'credential:create');
    (0, vitest_1.expect)(result.canCreate).toBe(false);
  });
});
(0, vitest_1.describe)('ChefsService.createFormCredential', () => {
  const input = {
    name: '  Intake credential ',
    formName: 'Intake',
    baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
    formId: 'form-123',
    apiKey: 'secret', // pragma: allowlist secret
    projectId: 'proj-1',
  };
  (0, vitest_1.it)('creates with a single owner project through n8n and returns no API key', async () => {
    const { service, n8nCredentials } = createService();
    const created = await service.createFormCredential(USER, input);
    (0, vitest_1.expect)(n8nCredentials.create).toHaveBeenCalledWith(USER, {
      name: 'Intake credential',
      type: 'chefsFormAuth',
      projectId: 'proj-1',
      data: {
        formName: 'Intake',
        baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
        formId: 'form-123',
        apiKey: 'secret', // pragma: allowlist secret
      },
    });
    (0, vitest_1.expect)(created).toEqual({
      id: 'cred-new',
      name: 'Intake credential',
      formName: 'Intake',
      formId: 'form-123',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
      scopes: ['credential:read', 'credential:update'],
    });
    (0, vitest_1.expect)(JSON.stringify(created)).not.toContain('secret');
  });
  (0, vitest_1.it)('rejects a missing API key before calling n8n', async () => {
    const { service, n8nCredentials } = createService();
    await (0, vitest_1.expect)(service.createFormCredential(USER, { ...input, apiKey: '  ' })).rejects.toMatchObject({
      statusCode: 400,
    });
    (0, vitest_1.expect)(n8nCredentials.create).not.toHaveBeenCalled();
  });
  vitest_1.it.each([
    'https://evil.example/app/api/v1',
    'javascript:alert(1)',
    'http://submit.digital.gov.bc.ca/app/api/v1',
  ])('rejects a base URL outside the CHEFS allowlist (%s) with 400 before calling n8n', async (baseUrl) => {
    const { service, n8nCredentials } = createService();
    await (0, vitest_1.expect)(service.createFormCredential(USER, { ...input, baseUrl })).rejects.toMatchObject({
      statusCode: 400,
    });
    (0, vitest_1.expect)(n8nCredentials.create).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('accepts a base URL on the additional allowed origins list', async () => {
    const { service, n8nCredentials } = createService();
    await service.createFormCredential(USER, { ...input, baseUrl: 'https://chefs-dev.example/app/api/v1' });
    (0, vitest_1.expect)(n8nCredentials.create).toHaveBeenCalled();
  });
});
(0, vitest_1.describe)('ChefsService.updateFormCredential', () => {
  const input = {
    credentialId: 'cred-1',
    allowedProjectIds: TENANT_PROJECTS,
    name: 'Intake credential',
    formName: 'Intake v2',
    baseUrl: 'https://chefs-dev.example/app/api/v1',
    formId: 'form-123',
  };
  (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
  (0, vitest_1.it)('requires n8n credential:update and passes the new key through', async () => {
    const { service, n8nCredentials } = createService();
    await service.updateFormCredential(USER, { ...input, apiKey: 'rotated' }); // pragma: allowlist secret
    (0, vitest_1.expect)(n8nCredentials.findForUser).toHaveBeenCalledWith('cred-1', USER, ['credential:update']);
    (0, vitest_1.expect)(n8nCredentials.update).toHaveBeenCalledWith(USER, credential('cred-1', 'proj-1'), {
      name: 'Intake credential',
      type: 'chefsFormAuth',
      data: {
        formName: 'Intake v2',
        baseUrl: 'https://chefs-dev.example/app/api/v1',
        formId: 'form-123',
        apiKey: 'rotated', // pragma: allowlist secret
      },
    });
  });
  (0, vitest_1.it)('keeps the stored API key when none is supplied', async () => {
    const { service, n8nCredentials } = createService();
    await service.updateFormCredential(USER, input);
    (0, vitest_1.expect)(n8nCredentials.update.mock.calls[0][2].data.apiKey).toBe(BLANK);
  });
  (0, vitest_1.it)('returns 404 when the user cannot update the credential', async () => {
    const { service, n8nCredentials } = createService();
    n8nCredentials.findForUser.mockResolvedValueOnce(null);
    await (0, vitest_1.expect)(service.updateFormCredential(USER, input)).rejects.toMatchObject({ statusCode: 404 });
    (0, vitest_1.expect)(n8nCredentials.update).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('rejects update outside the tenant', async () => {
    const { service, n8nCredentials } = createService();
    n8nCredentials.findForUser.mockResolvedValueOnce(credential('cred-1', 'proj-9'));
    await (0, vitest_1.expect)(service.updateFormCredential(USER, input)).rejects.toMatchObject({ statusCode: 404 });
  });
  (0, vitest_1.it)('rejects a non-CHEFS credential', async () => {
    const { service, n8nCredentials } = createService();
    n8nCredentials.findForUser.mockResolvedValueOnce(credential('cred-1', 'proj-1', 'httpBasicAuth'));
    await (0, vitest_1.expect)(service.updateFormCredential(USER, input)).rejects.toMatchObject({ statusCode: 404 });
  });
  (0, vitest_1.it)('rejects a base URL outside the CHEFS allowlist with 400 before calling n8n', async () => {
    const { service, n8nCredentials } = createService();
    await (0, vitest_1.expect)(
      service.updateFormCredential(USER, { ...input, baseUrl: 'https://evil.example/app/api/v1' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    (0, vitest_1.expect)(n8nCredentials.update).not.toHaveBeenCalled();
  });
});
(0, vitest_1.describe)('ChefsService.applyCredentialToTriggerMetadata', () => {
  (0, vitest_1.it)('requires n8n credential:read for the saving user', async () => {
    const { service, n8nCredentials } = createService();
    n8nCredentials.findForUser.mockResolvedValueOnce(null);
    await (0, vitest_1.expect)(
      service.applyCredentialToTriggerMetadata({ n8nCredentialId: 'cred-1' }, TENANT_PROJECTS, USER),
    ).rejects.toMatchObject({ statusCode: 403 });
    (0, vitest_1.expect)(n8nCredentials.findForUser).toHaveBeenCalledWith('cred-1', USER, ['credential:read']);
  });
  (0, vitest_1.it)('rejects binding a credential when the session has no n8n user', async () => {
    const { service } = createService();
    await (0, vitest_1.expect)(
      service.applyCredentialToTriggerMetadata({ n8nCredentialId: 'cred-1' }, TENANT_PROJECTS, null),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  (0, vitest_1.it)('rejects metadata without a credential id so no raw API key is ever persisted', async () => {
    const { service } = createService();
    const metadata = { formId: 'form-1', apiKey: 'raw-key' }; // pragma: allowlist secret
    await (0, vitest_1.expect)(
      service.applyCredentialToTriggerMetadata(metadata, TENANT_PROJECTS, null),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
