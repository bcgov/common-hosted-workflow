/**
 * List, create, and trigger-metadata binding for n8n `chefsFormAuth` credentials.
 * The API key may be decrypted inside the service, but it must not leave these methods.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChefsService } from '../../../src/api/services/chefs.service';
import { CREDENTIAL_ROLE_OWNER } from '../../../src/api/constants/enum';

const PROJECT_IDS = ['proj-1'];
const ENCRYPTED = 'encrypted-blob';
const DECRYPTED = {
  formId: 'form-123',
  formName: 'Intake',
  baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
  apiKey: 'decrypted-key', // pragma: allowlist secret
};

function createService() {
  const listByTypeSharedWithProjects = vi
    .fn()
    .mockResolvedValue([{ id: 'cred-1', name: 'Intake credential', type: 'chefsFormAuth', data: ENCRYPTED }]);
  const findOneBy = vi.fn().mockResolvedValue({
    id: 'cred-1',
    name: 'Intake credential',
    type: 'chefsFormAuth',
    data: ENCRYPTED,
  });
  const findProjectIds = vi.fn().mockResolvedValue(PROJECT_IDS);
  const create = vi.fn().mockImplementation((value) => value);
  const save = vi.fn().mockImplementation(async (value) => ({ ...value, id: value.id ?? 'cred-new' }));
  const shareCreate = vi.fn().mockImplementation((value) => value);
  const shareSave = vi.fn().mockResolvedValue(undefined);
  const decryptData = vi.fn().mockResolvedValue(DECRYPTED);
  const encryptData = vi.fn().mockResolvedValue(ENCRYPTED);

  const service = new ChefsService(
    {
      credential: { listByTypeSharedWithProjects, findOneBy, create, save },
      sharedCredential: {
        metadata: { tableName: 'shared_credentials' },
        findProjectIds,
        create: shareCreate,
        save: shareSave,
      },
    } as any,
    { decryptData, encryptData } as any,
  );

  return {
    service,
    listByTypeSharedWithProjects,
    findOneBy,
    findProjectIds,
    decryptData,
    encryptData,
    create,
    save,
    shareCreate,
    shareSave,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ChefsService.listFormCredentials', () => {
  it('returns display fields and omits the API key', async () => {
    const { service, decryptData } = createService();

    const result = await service.listFormCredentials(PROJECT_IDS);

    expect(result).toEqual([
      {
        id: 'cred-1',
        name: 'Intake credential',
        formName: 'Intake',
        formId: 'form-123',
        baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
      },
    ]);
    expect(result[0]).not.toHaveProperty('apiKey');
    expect(decryptData).toHaveBeenCalled();
  });

  it('skips a credential that cannot be decrypted', async () => {
    const { service, decryptData } = createService();
    decryptData.mockRejectedValueOnce(new Error('bad cipher'));

    const result = await service.listFormCredentials(PROJECT_IDS);

    expect(result).toEqual([]);
  });
});

describe('ChefsService.createFormCredential', () => {
  it('encrypts the key, saves a chefsFormAuth credential, and shares it with the tenant projects', async () => {
    const { service, encryptData, save, shareCreate, shareSave } = createService();

    const result = await service.createFormCredential({
      name: 'Intake credential',
      formName: 'Intake',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
      formId: 'form-123',
      apiKey: 'plain-key', // pragma: allowlist secret
      projectIds: ['proj-1', 'proj-1'],
    });

    expect(result).toEqual({
      id: 'cred-new',
      name: 'Intake credential',
      formName: 'Intake',
      formId: 'form-123',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
    });
    expect(result).not.toHaveProperty('apiKey');
    expect(encryptData).toHaveBeenCalledWith(
      { id: null, name: 'Intake credential', type: 'chefsFormAuth' },
      {
        formName: 'Intake',
        baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
        formId: 'form-123',
        apiKey: 'plain-key', // pragma: allowlist secret
      },
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chefsFormAuth', data: ENCRYPTED, usageScope: 'project' }),
    );
    expect(shareCreate).toHaveBeenCalledTimes(1);
    expect(shareCreate).toHaveBeenCalledWith({
      credentialsId: 'cred-new',
      projectId: 'proj-1',
      role: CREDENTIAL_ROLE_OWNER,
    });
    expect(shareSave).toHaveBeenCalledTimes(1);
  });

  it('rejects a credential name shorter than 3 characters', async () => {
    const { service, encryptData } = createService();

    await expect(
      service.createFormCredential({
        name: 'ab',
        formName: 'Intake',
        baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
        formId: 'form-123',
        apiKey: 'plain-key', // pragma: allowlist secret
        projectIds: PROJECT_IDS,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(encryptData).not.toHaveBeenCalled();
  });
});

describe('ChefsService.updateFormCredential', () => {
  it('keeps the existing API key when none is supplied', async () => {
    const { service, decryptData, encryptData, save } = createService();

    const result = await service.updateFormCredential({
      credentialId: 'cred-1',
      allowedProjectIds: PROJECT_IDS,
      name: 'Renamed credential',
      formName: 'Renamed form',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
      formId: 'form-123',
    });

    expect(result).toEqual({
      id: 'cred-1',
      name: 'Renamed credential',
      formName: 'Renamed form',
      formId: 'form-123',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
    });
    expect(decryptData).toHaveBeenCalled();
    expect(encryptData).toHaveBeenCalledWith(
      { id: 'cred-1', name: 'Renamed credential', type: 'chefsFormAuth' },
      {
        formName: 'Renamed form',
        baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
        formId: 'form-123',
        apiKey: DECRYPTED.apiKey,
      },
    );
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'cred-1', name: 'Renamed credential' }));
  });

  it('rotates the API key when a new one is supplied', async () => {
    const { service, decryptData, encryptData } = createService();

    await service.updateFormCredential({
      credentialId: 'cred-1',
      allowedProjectIds: PROJECT_IDS,
      name: 'Intake credential',
      formName: 'Intake',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
      formId: 'form-123',
      apiKey: 'rotated-key', // pragma: allowlist secret
    });

    expect(decryptData).not.toHaveBeenCalled();
    expect(encryptData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ apiKey: 'rotated-key' }), // pragma: allowlist secret
    );
  });

  it('throws 404 when the credential does not exist', async () => {
    const { service, findOneBy } = createService();
    findOneBy.mockResolvedValueOnce(null);

    await expect(
      service.updateFormCredential({
        credentialId: 'missing',
        allowedProjectIds: PROJECT_IDS,
        name: 'Intake credential',
        formName: 'Intake',
        baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
        formId: 'form-123',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when the credential is not shared with an allowed project', async () => {
    const { service, findProjectIds } = createService();
    findProjectIds.mockResolvedValueOnce(['other-proj']);

    await expect(
      service.updateFormCredential({
        credentialId: 'cred-1',
        allowedProjectIds: PROJECT_IDS,
        name: 'Intake credential',
        formName: 'Intake',
        baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
        formId: 'form-123',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('ChefsService.applyCredentialToTriggerMetadata', () => {
  it('replaces client form fields with the credential and drops the API key', async () => {
    const { service } = createService();

    const result = await service.applyCredentialToTriggerMetadata(
      {
        n8nCredentialId: 'cred-1',
        formId: 'client-form',
        formName: 'Client name',
        baseUrl: 'https://evil.example',
        apiKey: 'client-key', // pragma: allowlist secret
        postBody: '{}',
      },
      PROJECT_IDS,
    );

    expect(result).toEqual({
      n8nCredentialId: 'cred-1',
      formId: 'form-123',
      formName: 'Intake',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
      postBody: '{}',
    });
    expect(result).not.toHaveProperty('apiKey');
  });

  it('leaves metadata unchanged when no credential id is set', async () => {
    const { service, decryptData } = createService();
    const metadata = { formId: 'legacy-form', apiKey: 'legacy-key' }; // pragma: allowlist secret

    const result = await service.applyCredentialToTriggerMetadata(metadata, PROJECT_IDS);

    expect(result).toBe(metadata);
    expect(decryptData).not.toHaveBeenCalled();
  });
});
