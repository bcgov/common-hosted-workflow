import type { IExecuteFunctions, IHttpRequestOptions, IDataObject, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

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
      ...(headers ?? {}),
    },
    json: true,
  };

  if (body) {
    options.body = body;
  }

  try {
    return (await this.helpers.httpRequestWithAuthentication.call(this, 'oAuth2Api', options)) as IDataObject;
  } catch (error) {
    throw new NodeApiError(this.getNode(), error as JsonObject);
  }
}

/**
 * Make a request to CDOGS that returns binary content (e.g. generated documents).
 * Returns the full response including headers and body as Buffer.
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

  const options: IHttpRequestOptions = {
    method,
    url,
    headers: {
      ...(headers ?? {}),
    },
    encoding: 'arraybuffer',
    returnFullResponse: true,
    json: false,
  };

  if (body) {
    options.body = body;
    options.headers = { ...options.headers, 'Content-Type': 'application/json' };
  }

  try {
    const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'oAuth2Api', options)) as {
      body: Buffer;
      headers: IDataObject;
    };
    return response;
  } catch (error) {
    throw new NodeApiError(this.getNode(), error as JsonObject);
  }
}
