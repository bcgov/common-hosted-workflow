'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CredentialDecryptService = void 0;
const errors_1 = require('../utils/errors');
const logger_1 = require('../utils/logger');
const log = (0, logger_1.createLogger)('CredentialDecryptService');
/**
 * Decrypts n8n credential records using n8n's own `Credentials` helper, for the
 * CHEFS token-exchange (use) path. Creating and updating credentials goes
 * through `N8nCredentialsService`.
 *
 * This service is a thin adapter over the `@n8n/core` `Credentials` class so
 * that any change to n8n's internal decryption API is a single-file fix. It is
 * resolved at bootstrap via `require(N8N_CORE_PATH)` following the same pattern
 * as the other n8n runtime services.
 */
class CredentialDecryptService {
  CredentialsClass;
  constructor(CredentialsClass) {
    this.CredentialsClass = CredentialsClass;
  }
  /**
   * Returns the decrypted credential data object for an encrypted record.
   * Throws `AppError(500)` if decryption fails (e.g. the instance encryption
   * key differs or the ciphertext is malformed).
   */
  async decryptData(record) {
    const credentials = new this.CredentialsClass({ id: record.id, name: record.name }, record.type, record.data);
    try {
      return await credentials.getData();
    } catch (err) {
      log.error('Failed to decrypt credential', { credentialType: record.type, error: String(err) });
      throw new errors_1.AppError(500, 'Failed to decrypt credential');
    }
  }
}
exports.CredentialDecryptService = CredentialDecryptService;
