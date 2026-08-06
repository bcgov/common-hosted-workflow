import type { IExecuteFunctions, IHttpRequestOptions, IRequestOptions, IDataObject, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { CDOGS_OAUTH2_CREDENTIAL } from './constants';

/**
 * Make a JSON API request to CDOGS and return the parsed response body.
 */
export async function cdogsApiRequest(
  this: IExecuteFunctions,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: IDataObject | Buffer,
  headers?: IDataObject,
): Promise<IDataObject> {
  const baseUrl = this.getNodeParameter('baseUrl', 0) as string;
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;

  const options: IHttpRequestOptions = {
    method,
    url,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    json: true,
  };

  if (body) {
    options.body = body;
  }

  try {
    return (await this.helpers.httpRequestWithAuthentication.call(
      this,
      CDOGS_OAUTH2_CREDENTIAL,
      options,
    )) as IDataObject;
  } catch (error) {
    throw new NodeApiError(this.getNode(), error as JsonObject);
  }
}

/**
 * Make a request to CDOGS that returns binary content (e.g. generated documents).
 * Returns the full response including headers and body as Buffer.
 *
 * --- DEPRECATION NOTE / TECH DEBT ---
 * This function uses `requestOAuth2()` with the deprecated `IRequestOptions` interface.
 * This is intentional: as of n8n 2.x, `httpRequestWithAuthentication()` does not reliably
 * handle binary POST responses with `returnFullResponse` semantics that CDOGS requires.
 * The workaround is isolated here to limit blast radius when the modern helper gains support.
 *
 * TODO: Re-evaluate once n8n exposes a stable binary-response + full-headers path in
 * `httpRequestWithAuthentication` / `IHttpRequestOptions`. Track removal as tech debt.
 * ---
 */
export async function cdogsApiBinaryResponse(
  this: IExecuteFunctions,
  method: 'GET' | 'POST',
  path: string,
  body?: IDataObject,
  headers?: IDataObject,
): Promise<{ body: Buffer; headers: IDataObject }> {
  const baseUrl = this.getNodeParameter('baseUrl', 0) as string;
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;

  // Match the transport used by n8n's HTTP Request node for generic OAuth2.
  // On n8n 2.x, the newer authenticated HTTP helper can mishandle some binary
  // POST requests; requestOAuth2 keeps the method/body behavior that CDOGS expects.
  const options: IRequestOptions = {
    method,
    url,
    headers: {
      ...headers,
    },
    encoding: null,
    resolveWithFullResponse: true,
    followAllRedirects: true,
    json: false,
  };

  if (body) {
    options.body = JSON.stringify(body);
    options.headers = { ...options.headers, 'Content-Type': 'application/json' };
  }

  try {
    // eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions -- n8n's HTTP Request node uses this path for generic OAuth2, and CDOGS binary POSTs require matching behavior.
    const response = (await this.helpers.requestOAuth2.call(this, CDOGS_OAUTH2_CREDENTIAL, options, {
      tokenType: 'Bearer',
    })) as {
      body: Buffer;
      headers: IDataObject;
    };
    return response;
  } catch (error) {
    throw new NodeApiError(this.getNode(), error as JsonObject);
  }
}

/**
 * Upload a template as the multipart field expected by POST /template.
 * CDOGS reports an existing cached template as HTTP 405; when that response
 * includes its hash, the upload objective has still been satisfied.
 *
 * --- DEPRECATION NOTE / TECH DEBT ---
 * Uses `requestOAuth2()` with `IRequestOptions` because `httpRequestWithAuthentication()`
 * does not support multipart `formData` with raw Buffers as of n8n 2.x. The workaround is
 * intentionally isolated to this single function.
 *
 * TODO: Re-evaluate once n8n's modern helper supports multipart form uploads.
 * ---
 */
export async function cdogsApiUploadTemplate(
  this: IExecuteFunctions,
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ hash: string; cached: boolean }> {
  const baseUrl = this.getNodeParameter('baseUrl', 0) as string;
  const url = `${baseUrl.replace(/\/$/, '')}/template`;
  const options: IRequestOptions = {
    method: 'POST',
    url,
    formData: {
      template: {
        value: buffer,
        options: {
          filename: fileName,
          contentType: mimeType,
        },
      },
    } as unknown as IDataObject,
    resolveWithFullResponse: true,
    followAllRedirects: true,
    json: false,
  };

  try {
    // eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions -- requestOAuth2 is also used by n8n's generic OAuth2 HTTP Request node and correctly supports multipart formData.
    const response = (await this.helpers.requestOAuth2.call(this, CDOGS_OAUTH2_CREDENTIAL, options, {
      tokenType: 'Bearer',
    })) as { body?: unknown; headers?: IDataObject };
    return { hash: extractTemplateHash(response.headers, response.body), cached: false };
  } catch (error) {
    const statusCode = getErrorStatusCode(error);
    const responseBody = getErrorResponseBody(error);
    const hash = extractTemplateHash(undefined, responseBody);
    if (statusCode === 405 && hash) {
      return { hash, cached: true };
    }
    throw new NodeApiError(this.getNode(), error as JsonObject);
  }
}

function extractTemplateHash(headers: IDataObject | undefined, body: unknown): string {
  const headerEntry = Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === 'x-template-hash');
  if (typeof headerEntry?.[1] === 'string' && headerEntry[1]) {
    return headerEntry[1];
  }

  const parsedBody = parseResponseBody(body);
  if (parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
    const hash = (parsedBody as IDataObject).hash;
    return typeof hash === 'string' ? hash : '';
  }
  return typeof parsedBody === 'string' ? parsedBody.replace(/^"|"$/g, '') : '';
}

function parseResponseBody(body: unknown): unknown {
  if (Buffer.isBuffer(body)) {
    return parseResponseBody(body.toString('utf8'));
  }
  if (typeof body !== 'string') {
    return body;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function getErrorStatusCode(error: unknown): number | undefined {
  const typedError = error as {
    statusCode?: number;
    response?: { status?: number; statusCode?: number };
  };
  return typedError.statusCode ?? typedError.response?.statusCode ?? typedError.response?.status;
}

function getErrorResponseBody(error: unknown): unknown {
  const typedError = error as {
    error?: unknown;
    response?: { body?: unknown; data?: unknown };
  };
  return typedError.response?.body ?? typedError.response?.data ?? typedError.error;
}
