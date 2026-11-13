'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
/**
 * Unit tests for `ChefsService.resolveFormCredential` in
 * `src/api/services/chefs.service.ts`.
 *
 * The resolver loads a `chefsFormAuth` credential by ID, authorizes it against
 * the caller's allowed project scope, decrypts it via n8n's Cipher (mocked), and
 * returns `{ formId, formApiKey, formName }`. The raw API key must only ever come
 * from decryption — never from anywhere the caller controls.
 */
const vitest_1 = require('vitest');
const chefs_service_1 = require('../../../src/api/services/chefs.service');
const errors_1 = require('../../../src/api/utils/errors');
const CREDENTIAL_ID = 'cred-abc';
const ALLOWED_PROJECT_IDS = ['proj-1', 'proj-2'];
const CHEFS_CREDENTIAL_ROW = {
  id: CREDENTIAL_ID,
  name: 'My CHEFS Form',
  type: 'chefsFormAuth',
  data: 'encrypted-blob',
};
const DECRYPTED_DATA = {
  formId: 'form-123',
  apiKey: 'decrypted-key', // pragma: allowlist secret
  formName: 'My CHEFS Form',
  baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
};
function createService(overrides) {
  const findCredential = vitest_1.vi
    .fn()
    .mockResolvedValue(overrides?.credentialRow === undefined ? CHEFS_CREDENTIAL_ROW : overrides.credentialRow);
  const findProjectIds = vitest_1.vi.fn().mockResolvedValue(overrides?.credentialProjectIds ?? ['proj-1']);
  const decryptData = overrides?.decryptError
    ? vitest_1.vi.fn().mockRejectedValue(overrides.decryptError)
    : vitest_1.vi.fn().mockResolvedValue(overrides?.decrypted ?? DECRYPTED_DATA);
  const n8nRepositories = {
    credential: { findOneBy: findCredential },
    sharedCredential: { findProjectIds },
  };
  const credentialDecrypt = { decryptData };
  const service = new chefs_service_1.ChefsService(n8nRepositories, credentialDecrypt, {});
  return { service, findCredential, findProjectIds, decryptData };
}
(0, vitest_1.beforeEach)(() => {
  vitest_1.vi.clearAllMocks();
});
(0, vitest_1.describe)('ChefsService.resolveFormCredential', () => {
  (0, vitest_1.it)('returns formId, apiKey and formName from the decrypted credential', async () => {
    const { service, decryptData } = createService();
    const result = await service.resolveFormCredential({
      credentialId: CREDENTIAL_ID,
      allowedProjectIds: ALLOWED_PROJECT_IDS,
    });
    (0, vitest_1.expect)(result).toEqual({
      formId: 'form-123',
      formApiKey: 'decrypted-key', // pragma: allowlist secret
      formName: 'My CHEFS Form',
      baseUrl: 'https://submit.digital.gov.bc.ca/app/api/v1',
    });
    (0, vitest_1.expect)(decryptData).toHaveBeenCalledWith(CHEFS_CREDENTIAL_ROW);
  });
  (0, vitest_1.it)('omits baseUrl when the credential has no Base URL stored', async () => {
    const { service } = createService({
      decrypted: {
        formId: 'form-123',
        apiKey: 'decrypted-key', // pragma: allowlist secret
        formName: 'My CHEFS Form',
      },
    });
    const result = await service.resolveFormCredential({
      credentialId: CREDENTIAL_ID,
      allowedProjectIds: ALLOWED_PROJECT_IDS,
    });
    (0, vitest_1.expect)(result.baseUrl).toBeUndefined();
  });
  (0, vitest_1.it)('throws 404 when the credential does not exist', async () => {
    const { service } = createService({ credentialRow: null });
    await (0, vitest_1.expect)(
      service.resolveFormCredential({ credentialId: CREDENTIAL_ID, allowedProjectIds: ALLOWED_PROJECT_IDS }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
  (0, vitest_1.it)('throws 400 when the credential is not a chefsFormAuth type', async () => {
    const { service, decryptData } = createService({
      credentialRow: { ...CHEFS_CREDENTIAL_ROW, type: 'httpHeaderAuth' },
    });
    await (0, vitest_1.expect)(
      service.resolveFormCredential({ credentialId: CREDENTIAL_ID, allowedProjectIds: ALLOWED_PROJECT_IDS }),
    ).rejects.toMatchObject({ statusCode: 400 });
    // Must not attempt to decrypt a credential of the wrong type.
    (0, vitest_1.expect)(decryptData).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('throws 403 when the credential is not shared with any allowed project', async () => {
    const { service, decryptData } = createService({ credentialProjectIds: ['proj-other'] });
    await (0, vitest_1.expect)(
      service.resolveFormCredential({ credentialId: CREDENTIAL_ID, allowedProjectIds: ALLOWED_PROJECT_IDS }),
    ).rejects.toMatchObject({ statusCode: 403 });
    // Authorization must happen before decryption.
    (0, vitest_1.expect)(decryptData).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('authorizes when the credential shares at least one allowed project', async () => {
    const { service } = createService({ credentialProjectIds: ['proj-2'] });
    const result = await service.resolveFormCredential({
      credentialId: CREDENTIAL_ID,
      allowedProjectIds: ALLOWED_PROJECT_IDS,
    });
    (0, vitest_1.expect)(result.formApiKey).toBe('decrypted-key'); // pragma: allowlist secret
  });
  (0, vitest_1.it)('throws 400 when the decrypted credential is missing formId or apiKey', async () => {
    const { service } = createService({ decrypted: { formId: 'form-123' } });
    await (0, vitest_1.expect)(
      service.resolveFormCredential({ credentialId: CREDENTIAL_ID, allowedProjectIds: ALLOWED_PROJECT_IDS }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  (0, vitest_1.it)(
    'propagates the decryption failure from the decrypt service (which raises AppError 500)',
    async () => {
      // CredentialDecryptService.decryptData wraps decrypt failures as AppError(500);
      // resolveFormCredential must let that propagate to the caller unchanged.
      const { service } = createService({ decryptError: new errors_1.AppError(500, 'Failed to decrypt credential') });
      await (0, vitest_1.expect)(
        service.resolveFormCredential({ credentialId: CREDENTIAL_ID, allowedProjectIds: ALLOWED_PROJECT_IDS }),
      ).rejects.toMatchObject({ statusCode: 500 });
    },
  );
});
