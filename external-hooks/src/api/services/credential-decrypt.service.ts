import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const log = createLogger('CredentialDecryptService');

/**
 * Minimal structural type for n8n's `Credentials` class (from `@n8n/core`).
 * `getData()` resolves the DI-injected `Cipher` internally and decrypts the
 * credential's `data` blob via `decryptV2`, which understands both the legacy
 * CBC format and the newer key-rotation (`keyId:ciphertext`) format. Reusing
 * n8n's own class keeps decryption forward-compatible with future encryption
 * changes rather than reimplementing crypto here.
 */
type N8nCredentialsInstance = {
  getData: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  setData: (data: Record<string, unknown>) => void | Promise<void>;
  getDataToSave: () => { data?: string };
};

type N8nCredentialsClass = new (
  nodeCredentials: { id: string | null; name: string },
  type: string,
  data?: string,
) => N8nCredentialsInstance;

/** The encrypted credential row shape we need from n8n's CredentialsRepository. */
export type EncryptedCredentialRecord = {
  id: string;
  name: string;
  type: string;
  data: string;
};

/**
 * Decrypts n8n credential records using n8n's own `Credentials` helper.
 *
 * This service is a thin adapter over the `@n8n/core` `Credentials` class so
 * that any change to n8n's internal decryption API is a single-file fix. It is
 * resolved at bootstrap via `require(N8N_CORE_PATH)` following the same pattern
 * as the other n8n runtime services.
 */
export class CredentialDecryptService {
  constructor(private readonly CredentialsClass: N8nCredentialsClass) {}

  /**
   * Returns the decrypted credential data object for an encrypted record.
   * Throws `AppError(500)` if decryption fails (e.g. the instance encryption
   * key differs or the ciphertext is malformed).
   */
  async decryptData(record: EncryptedCredentialRecord): Promise<Record<string, unknown>> {
    const credentials = new this.CredentialsClass({ id: record.id, name: record.name }, record.type, record.data);

    try {
      return await credentials.getData();
    } catch (err) {
      log.error('Failed to decrypt credential', { credentialType: record.type, error: String(err) });
      throw new AppError(500, 'Failed to decrypt credential');
    }
  }

  /**
   * Encrypts plain credential data with n8n's Cipher via `Credentials.setData`.
   * Returns only the ciphertext. The plaintext is not logged.
   */
  async encryptData(
    identity: { id: string | null; name: string; type: string },
    plain: Record<string, unknown>,
  ): Promise<string> {
    const credentials = new this.CredentialsClass({ id: identity.id, name: identity.name }, identity.type);

    try {
      await credentials.setData(plain);
      const saved = credentials.getDataToSave();
      if (!saved.data) {
        throw new Error('Credential encryption produced no data');
      }
      return saved.data;
    } catch (err) {
      log.error('Failed to encrypt credential', { credentialType: identity.type, error: String(err) });
      throw new AppError(500, 'Failed to encrypt credential');
    }
  }
}
