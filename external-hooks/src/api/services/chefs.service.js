'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.ChefsService = void 0;
exports.readN8nCredentialId = readN8nCredentialId;
const axios_1 = __importDefault(require('axios'));
const errors_1 = require('../utils/errors');
const logger_1 = require('../utils/logger');
const url_1 = require('../utils/url');
const string_1 = require('../utils/string');
const _config_1 = require('@config');
const enum_1 = require('../constants/enum');
const log = (0, logger_1.createLogger)('ChefsService');
const CHEFS_CONNECTION_FAILED_MESSAGE =
  "Cannot connect to CHEFS with the selected CHEFS credential. Please check the credential's base URL, form ID and API key, then try again.";
/** Reads a non-empty n8n credential id from trigger metadata. */
function readN8nCredentialId(metadata) {
  const value = metadata[enum_1.N8N_CREDENTIAL_ID_METADATA_KEY];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
class ChefsService {
  n8nRepositories;
  credentialDecrypt;
  n8nCredentials;
  gatewayUrl;
  baseUrl;
  allowedOrigins;
  constructor(n8nRepositories, credentialDecrypt, n8nCredentials) {
    this.n8nRepositories = n8nRepositories;
    this.credentialDecrypt = credentialDecrypt;
    this.n8nCredentials = n8nCredentials;
    this.gatewayUrl = _config_1.CHEFS_GATEWAY_URL;
    this.baseUrl = _config_1.CHEFS_BASE_URL ? `${_config_1.CHEFS_BASE_URL}/app` : '';
    const configuredOrigin = _config_1.CHEFS_BASE_URL ? (0, url_1.extractOrigin)(_config_1.CHEFS_BASE_URL) : null;
    this.allowedOrigins = [
      ...new Set([...(configuredOrigin ? [configuredOrigin] : []), ..._config_1.CHEFS_ALLOWED_ORIGINS]),
    ];
  }
  /**
   * Resolves a `chefsFormAuth` credential by ID into the form ID + API key,
   * decrypting server-side via n8n's own Cipher. The raw key never leaves this
   * method — callers receive it only to build the CHEFS token request.
   *
   * Authorization: the credential must be shared with at least one project in
   * `allowedProjectIds`, so a credential ID from outside the caller's tenant
   * scope cannot be resolved.
   *
   * This is the *use* path (CHEFS token exchange when an action/trigger is
   * opened). The opener may not be an n8n project member, so access is scoped
   * to the tenant rather than to n8n user permissions — like n8n executing a
   * workflow with a credential the executing user cannot view.
   */
  async resolveFormCredential(params) {
    const { credentialId, allowedProjectIds } = params;
    const record = await this.n8nRepositories.credential.findOneBy({ id: credentialId });
    if (!record) {
      throw new errors_1.AppError(404, 'CHEFS credential not found');
    }
    if (record.type !== enum_1.CHEFS_FORM_AUTH_CREDENTIAL_TYPE) {
      throw new errors_1.AppError(400, 'Referenced credential is not a CHEFS form credential');
    }
    const credentialProjectIds = await this.n8nRepositories.sharedCredential.findProjectIds(credentialId);
    const authorized = credentialProjectIds.some((projectId) => allowedProjectIds.includes(projectId));
    if (!authorized) {
      log.warn('CHEFS credential not in caller scope', { credentialId: (0, string_1.shortenIdForLog)(credentialId) });
      throw new errors_1.AppError(403, 'Not authorized to use this CHEFS credential');
    }
    const data = await this.credentialDecrypt.decryptData(record);
    const formId = typeof data.formId === 'string' ? data.formId : '';
    const apiKey = typeof data.apiKey === 'string' ? data.apiKey : ''; // pragma: allowlist secret
    const formName = typeof data.formName === 'string' ? data.formName : undefined;
    const baseUrl = typeof data.baseUrl === 'string' && data.baseUrl.trim() ? data.baseUrl.trim() : undefined;
    if (!formId || !apiKey) {
      throw new errors_1.AppError(400, 'CHEFS credential is missing formId or apiKey');
    }
    return { formId, formApiKey: apiKey, formName, baseUrl };
  }
  /**
   * Lists `chefsFormAuth` credentials the user may read under n8n's permission
   * model, limited to credentials shared with this tenant's projects.
   */
  async listFormCredentials(user, tenantProjectIds) {
    const records = await this.n8nCredentials.listForUser(user, ['credential:read']);
    const inTenant = records.filter(
      (record) => record.type === enum_1.CHEFS_FORM_AUTH_CREDENTIAL_TYPE && isSharedWithAny(record, tenantProjectIds),
    );
    const credentials = [];
    for (const record of inTenant) {
      const summary = await this.toPublicSummary(user, record);
      if (summary) credentials.push(summary);
    }
    const canCreate = await this.n8nCredentials.canInProject(user, tenantProjectIds[0], 'credential:create');
    return { credentials, canCreate };
  }
  /** Creates a `chefsFormAuth` credential via n8n, owned by `params.projectId` only. */
  async createFormCredential(user, params) {
    const draft = normalizeCreateParams(params);
    this.assertAllowedBaseUrl(draft.baseUrl);
    const created = await this.n8nCredentials.create(user, {
      name: draft.name,
      type: enum_1.CHEFS_FORM_AUTH_CREDENTIAL_TYPE,
      projectId: draft.projectId,
      data: { formName: draft.formName, baseUrl: draft.baseUrl, formId: draft.formId, apiKey: draft.apiKey },
    });
    return {
      id: created.id,
      name: draft.name,
      formName: draft.formName,
      formId: draft.formId,
      baseUrl: draft.baseUrl,
      scopes: created.scopes,
    };
  }
  /**
   * Updates a `chefsFormAuth` credential via n8n. The user needs n8n's
   * `credential:update`; an empty API key keeps the stored one.
   */
  async updateFormCredential(user, params) {
    const existing = await this.n8nCredentials.findForUser(params.credentialId, user, ['credential:update']);
    if (
      !existing ||
      existing.type !== enum_1.CHEFS_FORM_AUTH_CREDENTIAL_TYPE ||
      !isSharedWithAny(existing, params.allowedProjectIds)
    ) {
      log.warn('CHEFS credential update blocked', { credentialId: (0, string_1.shortenIdForLog)(params.credentialId) });
      throw new errors_1.AppError(404, 'CHEFS credential not found');
    }
    if (existing.isManaged) {
      throw new errors_1.AppError(400, 'Managed credentials cannot be updated');
    }
    const draft = normalizeUpdateParams(params);
    this.assertAllowedBaseUrl(draft.baseUrl);
    await this.n8nCredentials.update(user, existing, {
      name: draft.name,
      type: enum_1.CHEFS_FORM_AUTH_CREDENTIAL_TYPE,
      data: {
        formName: draft.formName,
        baseUrl: draft.baseUrl,
        formId: draft.formId,
        apiKey: draft.apiKey || this.n8nCredentials.blankingValue,
      },
    });
    return {
      id: existing.id,
      name: draft.name,
      formName: draft.formName,
      formId: draft.formId,
      baseUrl: draft.baseUrl,
      scopes: await this.n8nCredentials.scopesFor(user, existing.id),
    };
  }
  /**
   * Resolves the n8n credential a chefs-form trigger must reference, checks the
   * saving user may read it in n8n, then replaces client-supplied form fields
   * with the credential's values. A raw API key is never persisted: it is
   * stripped from the metadata unconditionally, and the trigger is rejected with
   * a 400 when it does not name a credential.
   */
  async applyCredentialToTriggerMetadata(metadata, allowedProjectIds, user) {
    const credentialId = readN8nCredentialId(metadata);
    if (!credentialId) {
      throw new errors_1.AppError(400, 'Select a CHEFS credential for this trigger');
    }
    const readable = user ? await this.n8nCredentials.findForUser(credentialId, user, ['credential:read']) : null;
    if (!readable) {
      throw new errors_1.AppError(403, 'Not authorized to use this CHEFS credential');
    }
    const resolved = await this.resolveFormCredential({ credentialId, allowedProjectIds });
    const next = stripApiKey(metadata);
    next[enum_1.N8N_CREDENTIAL_ID_METADATA_KEY] = credentialId;
    next.formId = resolved.formId;
    next.formName = resolved.formName ?? '';
    next.baseUrl = resolved.baseUrl ?? '';
    return next;
  }
  async toPublicSummary(user, record) {
    try {
      const data = await this.n8nCredentials.decryptRedacted(record);
      return {
        id: record.id,
        name: record.name,
        formName: typeof data.formName === 'string' ? data.formName : '',
        formId: typeof data.formId === 'string' ? data.formId : '',
        baseUrl: typeof data.baseUrl === 'string' ? data.baseUrl : '',
        scopes: await this.n8nCredentials.scopesFor(user, record.id),
      };
    } catch (err) {
      log.warn('Skipping CHEFS credential that could not be decrypted', {
        credentialId: (0, string_1.shortenIdForLog)(record.id),
        error: String(err),
      });
      return null;
    }
  }
  /**
   * Rejects a credential Base URL whose origin is not on the CHEFS allowlist. The
   * origin includes the scheme, so this also rules out `javascript:`, `http:` and
   * other non-allowlisted schemes. Saving fails loudly here instead of the value
   * being silently ignored at token-exchange time (see `resolveChefsUrls`).
   */
  assertAllowedBaseUrl(baseUrl) {
    const origin = (0, url_1.extractOrigin)(baseUrl);
    if (!origin || !this.allowedOrigins.includes(origin)) {
      throw new errors_1.AppError(400, 'CHEFS base URL must be an allowed CHEFS origin');
    }
  }
  /**
   * Derives the CHEFS gateway URL (token exchange) and render base URL from a
   * credential's Base URL by keeping only its origin, so a credential pointing at
   * e.g. `https://chefs-dev.example/app/api/v1` resolves to
   * `https://chefs-dev.example/app/gateway/v1` and `https://chefs-dev.example/app`.
   *
   * Falls back to the env-derived values (`CHEFS_GATEWAY_URL` / `CHEFS_BASE_URL`)
   * when the credential has no usable Base URL — preserving the previous behaviour
   * for credential-less callers (e.g. CHEFS form triggers).
   *
   * The returned `baseUrl` is used by the external UI to load a `<script>` and to
   * build markup, so only an origin on the configured allowlist (the `CHEFS_BASE_URL`
   * origin plus `CHEFS_ALLOWED_ORIGINS`) is honoured — anything else falls back to
   * the configured env value instead of letting a credential or trigger metadata
   * point the UI at an arbitrary origin.
   */
  resolveChefsUrls(credentialBaseUrl) {
    const origin = credentialBaseUrl ? (0, url_1.extractOrigin)(credentialBaseUrl) : null;
    if (!origin || !this.allowedOrigins.includes(origin)) {
      if (credentialBaseUrl) {
        log.warn('CHEFS Base URL is not a valid, allowlisted origin; falling back to configured CHEFS_BASE_URL', {
          origin,
        });
      }
      return { gatewayUrl: this.gatewayUrl, baseUrl: this.baseUrl };
    }
    return {
      gatewayUrl: `${origin}/app/gateway/v1`,
      baseUrl: `${origin}/app`,
    };
  }
  async getFormToken(params) {
    const { formId, formApiKey, credentialBaseUrl } = params;
    const { gatewayUrl, baseUrl } = this.resolveChefsUrls(credentialBaseUrl);
    const tokenUrl = `${gatewayUrl}/${(0, url_1.buildPath)('auth', 'token', 'forms', formId)}`;
    const credentials = Buffer.from(`${formId}:${formApiKey}`).toString('base64');
    log.debug('CHEFS token exchange request', { tokenUrl, formId, gatewayUrl });
    try {
      const response = await axios_1.default.post(tokenUrl, undefined, {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
      });
      return {
        authToken: response.data.token,
        formId,
        baseUrl,
      };
    } catch (err) {
      if (axios_1.default.isAxiosError(err) && err.response) {
        log.error('CHEFS token exchange returned non-OK status', {
          status: err.response.status,
          tokenUrl,
          responseData: JSON.stringify(err.response.data),
        });
      } else {
        log.error('CHEFS token exchange network error', {
          error: String(err),
          tokenUrl,
          gatewayUrl,
          baseUrl,
        });
      }
      // Shown to the person opening the form, so say what to check rather than the raw failure.
      throw new errors_1.AppError(502, CHEFS_CONNECTION_FAILED_MESSAGE);
    }
  }
}
exports.ChefsService = ChefsService;
function normalizeCreateParams(params) {
  const name = params.name.trim();
  const formName = params.formName.trim();
  const baseUrl = params.baseUrl.trim();
  const formId = params.formId.trim();
  const apiKey = params.apiKey.trim();
  if (!params.projectId) {
    throw new errors_1.AppError(400, 'No project available for this credential');
  }
  if (name.length < 3 || name.length > 128) {
    throw new errors_1.AppError(400, 'Credential name must be 3 to 128 characters');
  }
  if (!formId || !apiKey || !baseUrl) {
    throw new errors_1.AppError(400, 'CHEFS credential requires a base URL, form id, and API key');
  }
  return { name, formName, baseUrl, formId, apiKey, projectId: params.projectId };
}
function isSharedWithAny(record, projectIds) {
  return (record.shared ?? []).some((share) => projectIds.includes(share.projectId));
}
function normalizeUpdateParams(params) {
  const name = params.name.trim();
  const formName = params.formName.trim();
  const baseUrl = params.baseUrl.trim();
  const formId = params.formId.trim();
  const apiKey = (params.apiKey ?? '').trim();
  if (name.length < 3 || name.length > 128) {
    throw new errors_1.AppError(400, 'Credential name must be 3 to 128 characters');
  }
  if (!formId || !baseUrl) {
    throw new errors_1.AppError(400, 'CHEFS credential requires a base URL and form id');
  }
  return { name, formName, baseUrl, formId, apiKey };
}
function stripApiKey(metadata) {
  const result = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.toLowerCase() !== 'apikey') {
      result[key] = value;
    }
  }
  return result;
}
