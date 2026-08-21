import type { IDataObject, IHttpRequestOptions, INode, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

export const GRAPH_CREDENTIAL_TYPE = 'bcGovSharePointOAuth2Api';

const DEFAULT_BASE_DELAY_MS = 500;

export interface GraphContext {
  helpers: {
    httpRequestWithAuthentication: (credentialType: string, options: IHttpRequestOptions) => Promise<unknown>;
  };
  getNode: () => INode;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatusCode(error: unknown): number | undefined {
  const typed = error as { statusCode?: number; response?: { statusCode?: number; status?: number } };
  return typed.statusCode ?? typed.response?.statusCode ?? typed.response?.status;
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === 429 || status === 503;
}

function getRetryAfterMs(error: unknown): number | undefined {
  const headers = (error as { response?: { headers?: Record<string, string> } })?.response?.headers;
  const retryAfter = headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (!retryAfter) return undefined;
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

/**
 * Issue an authenticated Graph API request, retrying on 429/503 — honouring
 * Retry-After when the response provides it, otherwise exponential backoff
 * with jitter — up to retry.maxRetries additional attempts (spec section 10).
 */
export async function graphRequest<T = unknown>(
  context: GraphContext,
  options: IHttpRequestOptions,
  retry: RetryOptions,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
    try {
      return (await context.helpers.httpRequestWithAuthentication(GRAPH_CREDENTIAL_TYPE, options)) as T;
    } catch (error) {
      lastError = error;
      const status = getStatusCode(error);
      if (!isRetryableStatus(status) || attempt === retry.maxRetries) {
        throw new NodeApiError(context.getNode(), error as JsonObject);
      }
      const backoffMs = getRetryAfterMs(error) ?? (retry.baseDelayMs ?? DEFAULT_BASE_DELAY_MS) * 2 ** attempt;
      await delay(backoffMs + Math.random() * 100);
    }
  }

  throw new NodeApiError(context.getNode(), lastError as JsonObject);
}

export interface PagingOptions {
  returnAll: boolean;
  limit?: number;
}

interface GraphListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

/**
 * Follow @odata.nextLink to accumulate all pages when returnAll is true;
 * otherwise fetch a single page (or stop early once `limit` is reached).
 */
export async function graphPagedRequest<T = unknown>(
  context: GraphContext,
  options: IHttpRequestOptions,
  retry: RetryOptions,
  paging: PagingOptions,
): Promise<T[]> {
  const results: T[] = [];
  let currentOptions: IHttpRequestOptions = options;

  for (;;) {
    const page = await graphRequest<GraphListResponse<T>>(context, currentOptions, retry);
    results.push(...page.value);

    const reachedLimit = !paging.returnAll && paging.limit !== undefined && results.length >= paging.limit;
    if (reachedLimit) {
      return results.slice(0, paging.limit);
    }

    const singlePageOnly = !paging.returnAll && paging.limit === undefined;
    const nextLink = page['@odata.nextLink'];
    if (singlePageOnly || !nextLink) {
      break;
    }
    currentOptions = { ...options, url: nextLink, qs: undefined };
  }

  return results;
}

export interface BinaryGraphResponse {
  body: Buffer;
  headers: IDataObject;
}

export interface BinaryRequestContext {
  helpers: {
    requestOAuth2: (
      credentialType: string,
      options: IDataObject,
      additionalOAuth2Options?: IDataObject,
    ) => Promise<BinaryGraphResponse>;
  };
  getNode: () => INode;
}

export interface BinaryGraphOptions {
  method: 'GET' | 'PUT';
  url: string;
  body?: Buffer;
  headers?: IDataObject;
}

/**
 * Binary Graph request (file content download/upload). `httpRequestWithAuthentication`
 * does not reliably handle binary POST/PUT bodies or responses as of n8n 2.x — see the
 * identical, already-proven workaround and its rationale in
 * CDOGSDocumentGenerator/shared/GenericFunctions.ts's `cdogsApiBinaryResponse`. This
 * mirrors that same requestOAuth2-based pattern for Graph's content endpoints, with the
 * same 429/503 + Retry-After retry semantics as graphRequest (spec section 10).
 */
export async function graphBinaryRequest(
  context: BinaryRequestContext,
  options: BinaryGraphOptions,
  retry: RetryOptions,
): Promise<BinaryGraphResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
    try {
      const requestOptions: IDataObject = {
        method: options.method,
        url: options.url,
        headers: options.headers ?? {},
        encoding: null,
        resolveWithFullResponse: true,
        followAllRedirects: true,
        json: false,
      };
      if (options.body) {
        requestOptions.body = options.body;
      }
      return await context.helpers.requestOAuth2(GRAPH_CREDENTIAL_TYPE, requestOptions, { tokenType: 'Bearer' });
    } catch (error) {
      lastError = error;
      const status = getStatusCode(error);
      if (!isRetryableStatus(status) || attempt === retry.maxRetries) {
        throw new NodeApiError(context.getNode(), error as JsonObject);
      }
      const backoffMs = getRetryAfterMs(error) ?? (retry.baseDelayMs ?? DEFAULT_BASE_DELAY_MS) * 2 ** attempt;
      await delay(backoffMs + Math.random() * 100);
    }
  }

  throw new NodeApiError(context.getNode(), lastError as JsonObject);
}
