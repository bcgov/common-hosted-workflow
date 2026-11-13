'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
/**
 * Unit tests for `CredentialDecryptService` in
 * `src/api/services/credential-decrypt.service.ts`.
 *
 * The service is a thin adapter over n8n's `Credentials` class: it constructs a
 * `Credentials` instance from an encrypted record and calls `getData()` to obtain
 * the decrypted object. Decryption failures are wrapped as AppError(500).
 */
const vitest_1 = require('vitest');
const credential_decrypt_service_1 = require('../../../src/api/services/credential-decrypt.service');
const errors_1 = require('../../../src/api/utils/errors');
const RECORD = {
  id: 'cred-1',
  name: 'CHEFS Form',
  type: 'chefsFormAuth',
  data: 'encrypted-blob',
};
const DECRYPTED = { formId: 'form-1', apiKey: 'k' }; // pragma: allowlist secret
/** Builds a fake n8n `Credentials` class whose getData resolves/rejects as configured. */
function makeCredentialsClass(getData) {
  const ctor = vitest_1.vi.fn();
  class FakeCredentials {
    constructor(nodeCredentials, type, data) {
      ctor(nodeCredentials, type, data);
    }
    getData = getData;
  }
  return { FakeCredentials: FakeCredentials, ctor };
}
(0, vitest_1.describe)('CredentialDecryptService', () => {
  (0, vitest_1.it)('constructs Credentials with the record fields and returns decrypted data', async () => {
    const { FakeCredentials, ctor } = makeCredentialsClass(() => Promise.resolve(DECRYPTED));
    const service = new credential_decrypt_service_1.CredentialDecryptService(FakeCredentials);
    const result = await service.decryptData(RECORD);
    (0, vitest_1.expect)(result).toEqual(DECRYPTED);
    (0, vitest_1.expect)(ctor).toHaveBeenCalledWith(
      { id: 'cred-1', name: 'CHEFS Form' },
      'chefsFormAuth',
      'encrypted-blob',
    );
  });
  (0, vitest_1.it)('wraps a decryption failure as AppError 500', async () => {
    const { FakeCredentials } = makeCredentialsClass(() => Promise.reject(new Error('bad key')));
    const service = new credential_decrypt_service_1.CredentialDecryptService(FakeCredentials);
    await (0, vitest_1.expect)(service.decryptData(RECORD)).rejects.toBeInstanceOf(errors_1.AppError);
    await (0, vitest_1.expect)(service.decryptData(RECORD)).rejects.toMatchObject({ statusCode: 500 });
  });
});
