/**
 * Unit tests for `CredentialDecryptService` in
 * `src/api/services/credential-decrypt.service.ts`.
 *
 * The service is a thin adapter over n8n's `Credentials` class: it constructs a
 * `Credentials` instance from an encrypted record and calls `getData()` to obtain
 * the decrypted object. Decryption failures are wrapped as AppError(500).
 */
import { describe, expect, it, vi } from 'vitest';

import { CredentialDecryptService } from '../../../src/api/services/credential-decrypt.service';
import { AppError } from '../../../src/api/utils/errors';

const RECORD = {
  id: 'cred-1',
  name: 'CHEFS Form',
  type: 'chefsFormAuth',
  data: 'encrypted-blob',
};

const DECRYPTED = { formId: 'form-1', apiKey: 'k' }; // pragma: allowlist secret

/** Builds a fake n8n `Credentials` class whose getData resolves/rejects as configured. */
function makeCredentialsClass(getData: () => Promise<Record<string, unknown>>) {
  const ctor = vi.fn();
  class FakeCredentials {
    constructor(nodeCredentials: { id: string | null; name: string }, type: string, data?: string) {
      ctor(nodeCredentials, type, data);
    }
    getData = getData;
  }
  return { FakeCredentials: FakeCredentials as any, ctor };
}

describe('CredentialDecryptService', () => {
  it('constructs Credentials with the record fields and returns decrypted data', async () => {
    const { FakeCredentials, ctor } = makeCredentialsClass(() => Promise.resolve(DECRYPTED));
    const service = new CredentialDecryptService(FakeCredentials);

    const result = await service.decryptData(RECORD);

    expect(result).toEqual(DECRYPTED);
    expect(ctor).toHaveBeenCalledWith({ id: 'cred-1', name: 'CHEFS Form' }, 'chefsFormAuth', 'encrypted-blob');
  });

  it('wraps a decryption failure as AppError 500', async () => {
    const { FakeCredentials } = makeCredentialsClass(() => Promise.reject(new Error('bad key')));
    const service = new CredentialDecryptService(FakeCredentials);

    await expect(service.decryptData(RECORD)).rejects.toBeInstanceOf(AppError);
    await expect(service.decryptData(RECORD)).rejects.toMatchObject({ statusCode: 500 });
  });
});
