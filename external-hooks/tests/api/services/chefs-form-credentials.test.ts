/**
 * CHEFS credential list/create/update/bind go through n8n's credential
 * services; ChefsService only adds the CHEFS type and tenant filters.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/config')>();
  return {
    ...original,
    CHEFS_BASE_URL: 'https://submit.digital.gov.bc.ca',
    CHEFS_GATEWAY_URL: 'https://submit.digital.gov.bc.ca/app/gateway/v1',
    CHEFS_ALLOWED_ORIGINS: ['https://chefs-dev.example'],
  };
});

import { ChefsService } from '../../../src/api/services/chefs.service';

const USER = { id: 'user-1', role: { slug: 'global:member' } };
const BLANK = '__n8n_BLANK_VALUE_test';
const TENANT_PROJECTS = ['proj-1', 'proj-2'];

function credential(id: string, projectId: string, type = 'chefsFormAuth') {
  return { id, name: `Cred ${id}`, type, data: 'enc', shared: [{ projectId, role: 'credential:owner' }] };
}

function createService() {
  const n8nCredentials = {
    blankingValue: BLANK,
    listForUser: vi
      .fn()
      .mockResolvedValue([
        credential('cred-1', 'proj-1'),
        credential('cred-other-tenant', 'proj-9'),
        credential('cred-wrong-type', 'proj-1', 'httpBasicAuth'),
      ]),
    findForUser: vi.fn().mockResolvedValue(credential('cred-1', 'proj-1')),
    canInProject: vi.fn().mockResolvedValue(true),
    create: vi.fn().mockResolvedValue({ id: 'cred-new', scopes: ['credential:read', 'credential:update'] }),
    update: vi.fn().mockResolvedValue(undefined),
    decryptRedacted: vi.fn().mockResolvedValue({
      formId: 'form-123',
      formName: 'Intake',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
      apiKey: BLANK,
    }),
    scopesFor: vi.fn().mockResolvedValue(['credential:read']),
  };
  const service = new ChefsService({} as any, {} as any, n8nCredentials as any);
  return { service, n8nCredentials };
}

describe('ChefsService.listFormCredentials', () => {
  it('lists readable CHEFS credentials in the tenant with scopes and no API key', async () => {
    const { service, n8nCredentials } = createService();

    const result = await service.listFormCredentials(USER, TENANT_PROJECTS);

    expect(n8nCredentials.listForUser).toHaveBeenCalledWith(USER, ['credential:read']);
    expect(result.credentials).toEqual([
      {
        id: 'cred-1',
        name: 'Cred cred-1',
        formName: 'Intake',
        formId: 'form-123',
        baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
        scopes: ['credential:read'],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(BLANK);
  });

  it('excludes credentials outside the tenant and of other types', async () => {
    const { service } = createService();
    const result = await service.listFormCredentials(USER, TENANT_PROJECTS);
    expect(result.credentials.map((c) => c.id)).toEqual(['cred-1']);
  });

  it('reports canCreate from n8n credential:create on the tenant project', async () => {
    const { service, n8nCredentials } = createService();
    n8nCredentials.canInProject.mockResolvedValueOnce(false);

    const result = await service.listFormCredentials(USER, TENANT_PROJECTS);

    expect(n8nCredentials.canInProject).toHaveBeenCalledWith(USER, 'proj-1', 'credential:create');
    expect(result.canCreate).toBe(false);
  });
});

describe('ChefsService.createFormCredential', () => {
  const input = {
    name: '  Intake credential ',
    formName: 'Intake',
    baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
    formId: 'form-123',
    apiKey: 'secret', // pragma: allowlist secret
    projectId: 'proj-1',
  };

  it('creates with a single owner project through n8n and returns no API key', async () => {
    const { service, n8nCredentials } = createService();

    const created = await service.createFormCredential(USER, input);

    expect(n8nCredentials.create).toHaveBeenCalledWith(USER, {
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
    expect(created).toEqual({
      id: 'cred-new',
      name: 'Intake credential',
      formName: 'Intake',
      formId: 'form-123',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
      scopes: ['credential:read', 'credential:update'],
    });
    expect(JSON.stringify(created)).not.toContain('secret');
  });

  it('rejects a missing API key before calling n8n', async () => {
    const { service, n8nCredentials } = createService();
    await expect(service.createFormCredential(USER, { ...input, apiKey: '  ' })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(n8nCredentials.create).not.toHaveBeenCalled();
  });

  it.each(['https://evil.example/app/api/v1', 'javascript:alert(1)', 'http://submit.digital.gov.bc.ca/app/api/v1'])(
    'rejects a base URL outside the CHEFS allowlist (%s) with 400 before calling n8n',
    async (baseUrl) => {
      const { service, n8nCredentials } = createService();
      await expect(service.createFormCredential(USER, { ...input, baseUrl })).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(n8nCredentials.create).not.toHaveBeenCalled();
    },
  );

  it('accepts a base URL on the additional allowed origins list', async () => {
    const { service, n8nCredentials } = createService();
    await service.createFormCredential(USER, { ...input, baseUrl: 'https://chefs-dev.example/app/api/v1' });
    expect(n8nCredentials.create).toHaveBeenCalled();
  });
});

describe('ChefsService.updateFormCredential', () => {
  const input = {
    credentialId: 'cred-1',
    allowedProjectIds: TENANT_PROJECTS,
    name: 'Intake credential',
    formName: 'Intake v2',
    baseUrl: 'https://chefs-dev.example/app/api/v1',
    formId: 'form-123',
  };

  beforeEach(() => vi.clearAllMocks());

  it('requires n8n credential:update and passes the new key through', async () => {
    const { service, n8nCredentials } = createService();

    await service.updateFormCredential(USER, { ...input, apiKey: 'rotated' }); // pragma: allowlist secret

    expect(n8nCredentials.findForUser).toHaveBeenCalledWith('cred-1', USER, ['credential:update']);
    expect(n8nCredentials.update).toHaveBeenCalledWith(USER, credential('cred-1', 'proj-1'), {
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

  it('keeps the stored API key when none is supplied', async () => {
    const { service, n8nCredentials } = createService();

    await service.updateFormCredential(USER, input);

    expect(n8nCredentials.update.mock.calls[0][2].data.apiKey).toBe(BLANK);
  });

  it('returns 404 when the user cannot update the credential', async () => {
    const { service, n8nCredentials } = createService();
    n8nCredentials.findForUser.mockResolvedValueOnce(null);
    await expect(service.updateFormCredential(USER, input)).rejects.toMatchObject({ statusCode: 404 });
    expect(n8nCredentials.update).not.toHaveBeenCalled();
  });

  it('rejects update outside the tenant', async () => {
    const { service, n8nCredentials } = createService();
    n8nCredentials.findForUser.mockResolvedValueOnce(credential('cred-1', 'proj-9'));
    await expect(service.updateFormCredential(USER, input)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a non-CHEFS credential', async () => {
    const { service, n8nCredentials } = createService();
    n8nCredentials.findForUser.mockResolvedValueOnce(credential('cred-1', 'proj-1', 'httpBasicAuth'));
    await expect(service.updateFormCredential(USER, input)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a base URL outside the CHEFS allowlist with 400 before calling n8n', async () => {
    const { service, n8nCredentials } = createService();
    await expect(
      service.updateFormCredential(USER, { ...input, baseUrl: 'https://evil.example/app/api/v1' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(n8nCredentials.update).not.toHaveBeenCalled();
  });
});

describe('ChefsService.applyCredentialToTriggerMetadata', () => {
  it('requires n8n credential:read for the saving user', async () => {
    const { service, n8nCredentials } = createService();
    n8nCredentials.findForUser.mockResolvedValueOnce(null);

    await expect(
      service.applyCredentialToTriggerMetadata({ n8nCredentialId: 'cred-1' }, TENANT_PROJECTS, USER),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(n8nCredentials.findForUser).toHaveBeenCalledWith('cred-1', USER, ['credential:read']);
  });

  it('rejects binding a credential when the session has no n8n user', async () => {
    const { service } = createService();
    await expect(
      service.applyCredentialToTriggerMetadata({ n8nCredentialId: 'cred-1' }, TENANT_PROJECTS, null),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('leaves metadata without a credential id unchanged', async () => {
    const { service } = createService();
    const metadata = { formId: 'form-1' };
    await expect(service.applyCredentialToTriggerMetadata(metadata, TENANT_PROJECTS, null)).resolves.toBe(metadata);
  });
});
