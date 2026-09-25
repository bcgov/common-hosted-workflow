import { instance } from './axios';

/** Public CHEFS credential returned by the API. The API key is never included. */
export interface ChefsCredentialSummary {
  id: string;
  name: string;
  formName: string;
  formId: string;
  baseUrl: string;
}

export const DEFAULT_CHEFS_BASE_URL = 'https://submit.digital.gov.bc.ca/app/api/v1';

export function chefsCredentialsQueryKey(tenantId: string) {
  return ['chefs-credentials', tenantId] as const;
}

export interface CreateChefsCredentialInput {
  name: string;
  formName: string;
  baseUrl: string;
  formId: string;
  apiKey: string;
}

export function listChefsCredentials(params: {
  tenantId: string;
  signal?: AbortSignal;
}): Promise<ChefsCredentialSummary[]> {
  return instance
    .get<{ data: ChefsCredentialSummary[] }>('/ui-api/wil/chefs-credentials', {
      headers: { 'X-TENANT-ID': params.tenantId },
      signal: params.signal,
    })
    .then((res) => res.data.data);
}

export function createChefsCredential(params: {
  tenantId: string;
  input: CreateChefsCredentialInput;
}): Promise<ChefsCredentialSummary> {
  return instance
    .post<ChefsCredentialSummary>('/ui-api/wil/chefs-credentials', params.input, {
      headers: { 'X-TENANT-ID': params.tenantId },
    })
    .then((res) => res.data);
}

export interface UpdateChefsCredentialInput {
  name: string;
  formName: string;
  baseUrl: string;
  formId: string;
  /** Omit to keep the credential's existing stored API key; provide a non-empty string to rotate it. */
  apiKey?: string;
}

export function updateChefsCredential(params: {
  tenantId: string;
  credentialId: string;
  input: UpdateChefsCredentialInput;
}): Promise<ChefsCredentialSummary> {
  return instance
    .patch<ChefsCredentialSummary>(`/ui-api/wil/chefs-credentials/${params.credentialId}`, params.input, {
      headers: { 'X-TENANT-ID': params.tenantId },
    })
    .then((res) => res.data);
}
