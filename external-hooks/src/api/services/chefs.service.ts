import axios from 'axios';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { buildPath, extractOrigin } from '../utils/url';
import { shortenIdForLog } from '../utils/string';
import { CHEFS_BASE_URL, CHEFS_GATEWAY_URL } from '@config';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CredentialDecryptService } from './credential-decrypt.service';
import {
  CHEFS_FORM_AUTH_CREDENTIAL_TYPE,
  CREDENTIAL_ROLE_OWNER,
  N8N_CREDENTIAL_ID_METADATA_KEY,
} from '../constants/enum';

const log = createLogger('ChefsService');

export type GetFormTokenParams = {
  formId: string;
  formApiKey: string;
  /**
   * The credential's CHEFS API Base URL (e.g. `https://chefs-dev.example/app/api/v1`).
   * When provided, the gateway and render base URLs are derived from its origin so
   * each credential targets its own CHEFS environment. Falls back to the
   * `CHEFS_BASE_URL` env value when omitted.
   */
  credentialBaseUrl?: string;
};

export type GetFormTokenResult = {
  authToken: string;
  formId: string;
  baseUrl: string;
};

export type ResolveFormCredentialParams = {
  credentialId: string;
  /** n8n project IDs the caller is allowed to act within (tenant scope). */
  allowedProjectIds: string[];
};

export type ResolvedFormCredential = {
  formId: string;
  formApiKey: string;
  formName?: string;
  /** The credential's CHEFS API Base URL, when stored on the credential. */
  baseUrl?: string;
};

/** Public view of a `chefsFormAuth` credential. The API key is never included. */
export type ChefsFormCredentialSummary = {
  id: string;
  name: string;
  formName: string;
  formId: string;
  baseUrl: string;
};

export type CreateChefsFormCredentialParams = {
  name: string;
  formName: string;
  baseUrl: string;
  formId: string;
  apiKey: string;
  /** n8n project IDs the new credential is shared with (tenant scope). */
  projectIds: string[];
};

export type UpdateChefsFormCredentialParams = {
  credentialId: string;
  /** n8n project IDs the caller is allowed to act within (tenant scope). */
  allowedProjectIds: string[];
  name: string;
  formName: string;
  baseUrl: string;
  formId: string;
  /** Omitted or empty keeps the credential's existing stored API key. */
  apiKey?: string;
};

/** Reads a non-empty n8n credential id from trigger metadata. */
export function readN8nCredentialId(metadata: Record<string, unknown>): string | null {
  const value = metadata[N8N_CREDENTIAL_ID_METADATA_KEY];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class ChefsService {
  private readonly gatewayUrl: string;
  private readonly baseUrl: string;

  constructor(
    private readonly n8nRepositories: N8nRepositories,
    private readonly credentialDecrypt: CredentialDecryptService,
  ) {
    this.gatewayUrl = CHEFS_GATEWAY_URL;
    this.baseUrl = CHEFS_BASE_URL ? `${CHEFS_BASE_URL}/app` : '';
  }

  /**
   * Resolves a `chefsFormAuth` credential by ID into the form ID + API key,
   * decrypting server-side via n8n's own Cipher. The raw key never leaves this
   * method — callers receive it only to build the CHEFS token request.
   *
   * Authorization: the credential must be shared with at least one project in
   * `allowedProjectIds`, so a credential ID from outside the caller's tenant
   * scope cannot be resolved.
   */
  async resolveFormCredential(params: ResolveFormCredentialParams): Promise<ResolvedFormCredential> {
    const { credentialId, allowedProjectIds } = params;

    const record = await this.n8nRepositories.credential.findOneBy({ id: credentialId });
    if (!record) {
      throw new AppError(404, 'CHEFS credential not found');
    }
    if (record.type !== CHEFS_FORM_AUTH_CREDENTIAL_TYPE) {
      throw new AppError(400, 'Referenced credential is not a CHEFS form credential');
    }

    const credentialProjectIds = await this.n8nRepositories.sharedCredential.findProjectIds(credentialId);
    const authorized = credentialProjectIds.some((projectId) => allowedProjectIds.includes(projectId));
    if (!authorized) {
      log.warn('CHEFS credential not in caller scope', { credentialId: shortenIdForLog(credentialId) });
      throw new AppError(403, 'Not authorized to use this CHEFS credential');
    }

    const data = await this.credentialDecrypt.decryptData(record);
    const formId = typeof data.formId === 'string' ? data.formId : '';
    const apiKey = typeof data.apiKey === 'string' ? data.apiKey : ''; // pragma: allowlist secret
    const formName = typeof data.formName === 'string' ? data.formName : undefined;
    const baseUrl = typeof data.baseUrl === 'string' && data.baseUrl.trim() ? data.baseUrl.trim() : undefined;

    if (!formId || !apiKey) {
      throw new AppError(400, 'CHEFS credential is missing formId or apiKey');
    }

    return { formId, formApiKey: apiKey, formName, baseUrl };
  }

  /**
   * Lists `chefsFormAuth` credentials shared with the caller's tenant projects.
   * Decrypted fields are limited to display values. A credential that cannot be
   * decrypted is skipped so one bad row does not hide the rest.
   */
  async listFormCredentials(allowedProjectIds: string[]): Promise<ChefsFormCredentialSummary[]> {
    const records = await this.n8nRepositories.credential.listByTypeSharedWithProjects(
      CHEFS_FORM_AUTH_CREDENTIAL_TYPE,
      allowedProjectIds,
      this.n8nRepositories.sharedCredential.metadata,
    );

    const summaries: ChefsFormCredentialSummary[] = [];
    for (const record of records) {
      const summary = await this.toPublicSummary(record);
      if (summary) summaries.push(summary);
    }
    return summaries;
  }

  /**
   * Creates an n8n `chefsFormAuth` credential, encrypted with n8n's cipher, and
   * shares it with each project in the tenant scope as `credential:owner`.
   * The API key is not returned.
   */
  async createFormCredential(params: CreateChefsFormCredentialParams): Promise<ChefsFormCredentialSummary> {
    const draft = normalizeCreateParams(params);
    const data = await this.credentialDecrypt.encryptData(
      { id: null, name: draft.name, type: CHEFS_FORM_AUTH_CREDENTIAL_TYPE },
      { formName: draft.formName, baseUrl: draft.baseUrl, formId: draft.formId, apiKey: draft.apiKey },
    );

    try {
      const created = this.n8nRepositories.credential.create({
        name: draft.name,
        type: CHEFS_FORM_AUTH_CREDENTIAL_TYPE,
        data,
        isManaged: false,
        isGlobal: false,
        isResolvable: false,
        resolvableAllowFallback: false,
        resolverId: null,
        usageScope: 'project',
      });
      const saved = await this.n8nRepositories.credential.save(created);
      if (!saved.id) {
        throw new AppError(500, 'Failed to save CHEFS credential');
      }
      await this.shareNewCredential(saved.id, draft.projectIds);
      return {
        id: saved.id,
        name: draft.name,
        formName: draft.formName,
        formId: draft.formId,
        baseUrl: draft.baseUrl,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error('Create CHEFS credential error', { error: String(err) });
      throw new AppError(500, 'Internal Server Error');
    }
  }

  /**
   * Updates an existing `chefsFormAuth` credential's display fields and, when a new
   * API key is supplied, rotates the stored key. Re-encrypts via n8n's own Cipher and
   * saves in place, leaving the credential's `shared_credentials` rows untouched.
   */
  async updateFormCredential(params: UpdateChefsFormCredentialParams): Promise<ChefsFormCredentialSummary> {
    const { credentialId, allowedProjectIds } = params;

    const record = await this.n8nRepositories.credential.findOneBy({ id: credentialId });
    if (!record) {
      throw new AppError(404, 'CHEFS credential not found');
    }
    if (record.type !== CHEFS_FORM_AUTH_CREDENTIAL_TYPE) {
      throw new AppError(400, 'Referenced credential is not a CHEFS form credential');
    }

    const credentialProjectIds = await this.n8nRepositories.sharedCredential.findProjectIds(credentialId);
    const authorized = credentialProjectIds.some((projectId) => allowedProjectIds.includes(projectId));
    if (!authorized) {
      log.warn('CHEFS credential not in caller scope', { credentialId: shortenIdForLog(credentialId) });
      throw new AppError(403, 'Not authorized to use this CHEFS credential');
    }

    const draft = normalizeUpdateParams(params);
    let apiKey = draft.apiKey;
    if (!apiKey) {
      const existing = await this.credentialDecrypt.decryptData(record);
      apiKey = typeof existing.apiKey === 'string' ? existing.apiKey : ''; // pragma: allowlist secret
    }
    if (!apiKey) {
      throw new AppError(400, 'CHEFS credential is missing an API key');
    }

    const data = await this.credentialDecrypt.encryptData(
      { id: credentialId, name: draft.name, type: CHEFS_FORM_AUTH_CREDENTIAL_TYPE },
      { formName: draft.formName, baseUrl: draft.baseUrl, formId: draft.formId, apiKey },
    );

    try {
      const saved = await this.n8nRepositories.credential.save({ ...record, name: draft.name, data });
      return {
        id: saved.id,
        name: draft.name,
        formName: draft.formName,
        formId: draft.formId,
        baseUrl: draft.baseUrl,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error('Update CHEFS credential error', { error: String(err) });
      throw new AppError(500, 'Internal Server Error');
    }
  }

  /**
   * When trigger metadata names an n8n credential, replaces client-supplied form
   * fields with the decrypted credential and removes any API key. Metadata
   * without a credential id is returned unchanged so legacy triggers still work.
   */
  async applyCredentialToTriggerMetadata(
    metadata: Record<string, unknown>,
    allowedProjectIds: string[],
  ): Promise<Record<string, unknown>> {
    const credentialId = readN8nCredentialId(metadata);
    if (!credentialId) return metadata;

    const resolved = await this.resolveFormCredential({ credentialId, allowedProjectIds });
    const next = stripApiKey(metadata);
    next[N8N_CREDENTIAL_ID_METADATA_KEY] = credentialId;
    next.formId = resolved.formId;
    next.formName = resolved.formName ?? '';
    next.baseUrl = resolved.baseUrl ?? '';
    return next;
  }

  private async toPublicSummary(record: {
    id: string;
    name: string;
    type: string;
    data: string;
  }): Promise<ChefsFormCredentialSummary | null> {
    try {
      const data = await this.credentialDecrypt.decryptData(record);
      return {
        id: record.id,
        name: record.name,
        formName: typeof data.formName === 'string' ? data.formName : '',
        formId: typeof data.formId === 'string' ? data.formId : '',
        baseUrl: typeof data.baseUrl === 'string' ? data.baseUrl : '',
      };
    } catch (err) {
      log.warn('Skipping CHEFS credential that could not be decrypted', {
        credentialId: shortenIdForLog(record.id),
        error: String(err),
      });
      return null;
    }
  }

  private async shareNewCredential(credentialId: string, projectIds: string[]): Promise<void> {
    for (const projectId of projectIds) {
      const share = this.n8nRepositories.sharedCredential.create({
        credentialsId: credentialId,
        projectId,
        role: CREDENTIAL_ROLE_OWNER,
      });
      await this.n8nRepositories.sharedCredential.save(share);
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
   */
  private resolveChefsUrls(credentialBaseUrl?: string): { gatewayUrl: string; baseUrl: string } {
    const origin = credentialBaseUrl ? extractOrigin(credentialBaseUrl) : null;
    if (!origin) {
      if (credentialBaseUrl) {
        log.warn('CHEFS credential Base URL is not a valid absolute URL; falling back to configured CHEFS_BASE_URL');
      }
      return { gatewayUrl: this.gatewayUrl, baseUrl: this.baseUrl };
    }

    return {
      gatewayUrl: `${origin}/app/gateway/v1`,
      baseUrl: `${origin}/app`,
    };
  }

  async getFormToken(params: GetFormTokenParams): Promise<GetFormTokenResult> {
    const { formId, formApiKey, credentialBaseUrl } = params;
    const { gatewayUrl, baseUrl } = this.resolveChefsUrls(credentialBaseUrl);
    const tokenUrl = `${gatewayUrl}/${buildPath('auth', 'token', 'forms', formId)}`;
    const credentials = Buffer.from(`${formId}:${formApiKey}`).toString('base64');

    log.debug('CHEFS token exchange request', { tokenUrl, formId, gatewayUrl });

    try {
      const response = await axios.post<{ token: string }>(tokenUrl, undefined, {
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
      if (axios.isAxiosError(err) && err.response) {
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
      throw new AppError(502, 'CHEFS token exchange failed');
    }
  }
}

function normalizeCreateParams(params: CreateChefsFormCredentialParams): CreateChefsFormCredentialParams {
  const name = params.name.trim();
  const formName = params.formName.trim();
  const baseUrl = params.baseUrl.trim();
  const formId = params.formId.trim();
  const apiKey = params.apiKey.trim();

  if (params.projectIds.length === 0) {
    throw new AppError(400, 'No project available for this credential');
  }
  if (name.length < 3 || name.length > 128) {
    throw new AppError(400, 'Credential name must be 3 to 128 characters');
  }
  if (!formId || !apiKey || !baseUrl) {
    throw new AppError(400, 'CHEFS credential requires a base URL, form id, and API key');
  }

  return { name, formName, baseUrl, formId, apiKey, projectIds: [...new Set(params.projectIds)] };
}

function normalizeUpdateParams(params: UpdateChefsFormCredentialParams): {
  name: string;
  formName: string;
  baseUrl: string;
  formId: string;
  apiKey: string;
} {
  const name = params.name.trim();
  const formName = params.formName.trim();
  const baseUrl = params.baseUrl.trim();
  const formId = params.formId.trim();
  const apiKey = (params.apiKey ?? '').trim();

  if (name.length < 3 || name.length > 128) {
    throw new AppError(400, 'Credential name must be 3 to 128 characters');
  }
  if (!formId || !baseUrl) {
    throw new AppError(400, 'CHEFS credential requires a base URL and form id');
  }

  return { name, formName, baseUrl, formId, apiKey };
}

function stripApiKey(metadata: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.toLowerCase() !== 'apikey') {
      result[key] = value;
    }
  }
  return result;
}
