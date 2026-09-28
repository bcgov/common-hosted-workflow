import axios from 'axios';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { buildPath, extractOrigin } from '../utils/url';
import { shortenIdForLog } from '../utils/string';
import { CHEFS_ALLOWED_ORIGINS, CHEFS_BASE_URL, CHEFS_GATEWAY_URL } from '@config';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CredentialDecryptService } from './credential-decrypt.service';
import { CHEFS_FORM_AUTH_CREDENTIAL_TYPE, N8N_CREDENTIAL_ID_METADATA_KEY } from '../constants/enum';
import type { N8nCredentialEntity, N8nCredentialsService, N8nUserEntity } from './n8n-credentials.service';

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
  /** The caller's n8n scopes on this credential, e.g. `credential:update`. */
  scopes: string[];
};

export type ChefsFormCredentialList = {
  credentials: ChefsFormCredentialSummary[];
  /** True when n8n grants `credential:create` on the tenant's project. */
  canCreate: boolean;
};

export type CreateChefsFormCredentialParams = {
  name: string;
  formName: string;
  baseUrl: string;
  formId: string;
  apiKey: string;
  /** The single n8n project that will own the credential. */
  projectId: string;
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
  private readonly allowedOrigins: string[];

  constructor(
    private readonly n8nRepositories: N8nRepositories,
    private readonly credentialDecrypt: CredentialDecryptService,
    private readonly n8nCredentials: N8nCredentialsService,
  ) {
    this.gatewayUrl = CHEFS_GATEWAY_URL;
    this.baseUrl = CHEFS_BASE_URL ? `${CHEFS_BASE_URL}/app` : '';
    const configuredOrigin = CHEFS_BASE_URL ? extractOrigin(CHEFS_BASE_URL) : null;
    this.allowedOrigins = [...new Set([...(configuredOrigin ? [configuredOrigin] : []), ...CHEFS_ALLOWED_ORIGINS])];
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
   * Lists `chefsFormAuth` credentials the user may read under n8n's permission
   * model, limited to credentials shared with this tenant's projects.
   */
  async listFormCredentials(user: N8nUserEntity, tenantProjectIds: string[]): Promise<ChefsFormCredentialList> {
    const records = await this.n8nCredentials.listForUser(user, ['credential:read']);
    const inTenant = records.filter(
      (record) => record.type === CHEFS_FORM_AUTH_CREDENTIAL_TYPE && isSharedWithAny(record, tenantProjectIds),
    );

    const credentials: ChefsFormCredentialSummary[] = [];
    for (const record of inTenant) {
      const summary = await this.toPublicSummary(user, record);
      if (summary) credentials.push(summary);
    }

    const canCreate = await this.n8nCredentials.canInProject(user, tenantProjectIds[0], 'credential:create');
    return { credentials, canCreate };
  }

  /** Creates a `chefsFormAuth` credential via n8n, owned by `params.projectId` only. */
  async createFormCredential(
    user: N8nUserEntity,
    params: CreateChefsFormCredentialParams,
  ): Promise<ChefsFormCredentialSummary> {
    const draft = normalizeCreateParams(params);
    const created = await this.n8nCredentials.create(user, {
      name: draft.name,
      type: CHEFS_FORM_AUTH_CREDENTIAL_TYPE,
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
  async updateFormCredential(
    user: N8nUserEntity,
    params: UpdateChefsFormCredentialParams,
  ): Promise<ChefsFormCredentialSummary> {
    const existing = await this.n8nCredentials.findForUser(params.credentialId, user, ['credential:update']);
    if (
      !existing ||
      existing.type !== CHEFS_FORM_AUTH_CREDENTIAL_TYPE ||
      !isSharedWithAny(existing, params.allowedProjectIds)
    ) {
      log.warn('CHEFS credential update blocked', { credentialId: shortenIdForLog(params.credentialId) });
      throw new AppError(404, 'CHEFS credential not found');
    }
    if (existing.isManaged) {
      throw new AppError(400, 'Managed credentials cannot be updated');
    }

    const draft = normalizeUpdateParams(params);
    await this.n8nCredentials.update(user, existing, {
      name: draft.name,
      type: CHEFS_FORM_AUTH_CREDENTIAL_TYPE,
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
   * When trigger metadata names an n8n credential, checks the saving user may
   * read it in n8n, then replaces client-supplied form fields with the
   * credential's values and removes any API key. Metadata without a credential
   * id is returned unchanged so legacy triggers still work.
   */
  async applyCredentialToTriggerMetadata(
    metadata: Record<string, unknown>,
    allowedProjectIds: string[],
    user: N8nUserEntity | null,
  ): Promise<Record<string, unknown>> {
    const credentialId = readN8nCredentialId(metadata);
    if (!credentialId) return metadata;

    const readable = user ? await this.n8nCredentials.findForUser(credentialId, user, ['credential:read']) : null;
    if (!readable) {
      throw new AppError(403, 'Not authorized to use this CHEFS credential');
    }

    const resolved = await this.resolveFormCredential({ credentialId, allowedProjectIds });
    const next = stripApiKey(metadata);
    next[N8N_CREDENTIAL_ID_METADATA_KEY] = credentialId;
    next.formId = resolved.formId;
    next.formName = resolved.formName ?? '';
    next.baseUrl = resolved.baseUrl ?? '';
    return next;
  }

  private async toPublicSummary(
    user: N8nUserEntity,
    record: N8nCredentialEntity,
  ): Promise<ChefsFormCredentialSummary | null> {
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
        credentialId: shortenIdForLog(record.id),
        error: String(err),
      });
      return null;
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
  private resolveChefsUrls(credentialBaseUrl?: string): { gatewayUrl: string; baseUrl: string } {
    const origin = credentialBaseUrl ? extractOrigin(credentialBaseUrl) : null;
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

  if (!params.projectId) {
    throw new AppError(400, 'No project available for this credential');
  }
  if (name.length < 3 || name.length > 128) {
    throw new AppError(400, 'Credential name must be 3 to 128 characters');
  }
  if (!formId || !apiKey || !baseUrl) {
    throw new AppError(400, 'CHEFS credential requires a base URL, form id, and API key');
  }

  return { name, formName, baseUrl, formId, apiKey, projectId: params.projectId };
}

function isSharedWithAny(record: N8nCredentialEntity, projectIds: string[]): boolean {
  return (record.shared ?? []).some((share) => projectIds.includes(share.projectId));
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
