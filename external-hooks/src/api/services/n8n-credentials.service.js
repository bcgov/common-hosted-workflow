'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.N8nCredentialsService = void 0;
const errors_1 = require('../utils/errors');
/**
 * Manages credentials through n8n's own services, so n8n decides who may
 * read, create and update them, redacts secrets, validates the data and emits
 * the same audit events as the n8n editor. No SQL or crypto lives here.
 */
class N8nCredentialsService {
  credentials;
  finder;
  projects;
  events;
  blankingValue;
  constructor(
    credentials,
    finder,
    projects,
    events,
    /** n8n's `CREDENTIAL_BLANKING_VALUE`: a redacted secret; on update it keeps the stored value. */
    blankingValue,
  ) {
    this.credentials = credentials;
    this.finder = finder;
    this.projects = projects;
    this.events = events;
    this.blankingValue = blankingValue;
  }
  async listForUser(user, scopes) {
    return await callN8n(() => this.finder.findCredentialsForUser(user, scopes));
  }
  async findForUser(credentialId, user, scopes) {
    return await callN8n(() => this.finder.findCredentialForUser(credentialId, user, scopes));
  }
  async canInProject(user, projectId, scope) {
    const project = await callN8n(() => this.projects.getProjectWithScope(user, projectId, [scope]));
    return project !== null;
  }
  async create(user, dto) {
    const created = await callN8n(() => this.credentials.createUnmanagedCredential(dto, user));
    this.events.emit('credentials-created', {
      user,
      credentialType: dto.type,
      credentialId: created.id,
      // Required by n8n's RelayEventMap since 2.45.x; audit/log-streaming relays record it as the
      // resource name. Omitting it leaves the audit entry's resourceName undefined.
      credentialName: dto.name,
      publicApi: false,
      projectId: dto.projectId,
      isDynamic: false,
      usesExternalSecrets: false,
    });
    return { id: created.id, scopes: created.scopes };
  }
  /** Mirrors n8n's `PATCH /credentials/:id`: unredact, re-encrypt, save, emit. */
  async update(user, existing, payload) {
    const prepared = await callN8n(() => this.credentials.prepareUpdateData(user, payload, existing));
    const encrypted = await callN8n(() =>
      this.credentials.createEncryptedData({
        id: existing.id,
        name: prepared.name,
        type: prepared.type,
        data: prepared.data,
      }),
    );
    const updated = await callN8n(() => this.credentials.update(existing.id, encrypted, prepared.data));
    if (!updated) {
      throw new errors_1.AppError(404, 'CHEFS credential not found');
    }
    this.events.emit('credentials-updated', {
      user,
      credentialType: existing.type,
      credentialId: existing.id,
      // Required by n8n's RelayEventMap since 2.45.x (see create above). `prepared.name` is the
      // name being written; fall back to the existing name if the update did not change it.
      credentialName: prepared.name ?? existing.name,
      isDynamic: false,
      usesExternalSecrets: false,
    });
  }
  /** Decrypts with n8n's redaction: password fields come back as `blankingValue`. */
  async decryptRedacted(credential) {
    return await callN8n(() => this.credentials.decrypt(credential));
  }
  async scopesFor(user, credentialId) {
    return await callN8n(() => this.credentials.getCredentialScopes(user, credentialId));
  }
}
exports.N8nCredentialsService = N8nCredentialsService;
/** n8n throws `ResponseError`s carrying `httpStatusCode`; keep 4xx statuses and messages. */
async function callN8n(fn) {
  try {
    return await fn();
  } catch (err) {
    const status = err.httpStatusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      throw new errors_1.AppError(status, err.message);
    }
    throw err;
  }
}
