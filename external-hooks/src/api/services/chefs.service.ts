import axios from 'axios';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { buildPath, extractOrigin } from '../utils/url';
import { shortenIdForLog } from '../utils/string';
import { CHEFS_BASE_URL, CHEFS_GATEWAY_URL } from '@config';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CredentialDecryptService } from './credential-decrypt.service';
import { CHEFS_FORM_AUTH_CREDENTIAL_TYPE } from '../constants/enum';

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
