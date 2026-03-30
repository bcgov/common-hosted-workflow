import type { IExecuteFunctions, IHttpRequestMethods, IHttpRequestOptions, IDataObject } from 'n8n-workflow';

/**
 * Build common headers for all WIL API requests:
 *  - X-N8N-API-KEY from credentials
 *  - Authorization: Bearer from INTERNAL_AUTH_TOKEN env
 *  - X-Workflow-Id from current workflow context
 */
export async function getAuthHeaders(ctx: IExecuteFunctions): Promise<Record<string, string>> {
  const credentials = await ctx.getCredentials('workflowInteractionLayerApi');
  // eslint-disable-next-line @n8n/community-nodes/no-restricted-globals
  const internalToken = process.env.INTERNAL_AUTH_TOKEN || 'mock-internal-token';

  return {
    'X-N8N-API-KEY': credentials.apiKey as string,
    Authorization: `Bearer ${internalToken}`,
    'X-TENANT-ID': credentials.tenantId as string,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/**
 * Resolve the base URL for the WIL API from n8nApi credentials.
 */
export async function getBaseUrl(ctx: IExecuteFunctions): Promise<string> {
  const credentials = await ctx.getCredentials('workflowInteractionLayerApi');
  const baseUrl = (credentials.baseUrl as string).replace(/\/$/, '');
  return `${baseUrl}/rest/custom/v1`;
}

/**
 * Make an authenticated HTTP request to the WIL API.
 */
export async function wilApiRequest(
  ctx: IExecuteFunctions,
  method: IHttpRequestMethods,
  path: string,
  body?: IDataObject,
  query?: IDataObject,
): Promise<unknown> {
  const baseUrl = await getBaseUrl(ctx);
  const headers = await getAuthHeaders(ctx);

  const options: IHttpRequestOptions = {
    method,
    url: `${baseUrl}${path}`,
    headers,
    json: true,
  };

  if (body && Object.keys(body).length > 0) {
    options.body = body;
  }

  if (query && Object.keys(query).length > 0) {
    options.qs = query;
  }

  return ctx.helpers.httpRequest(options);
}

/**
 * Safely parse a JSON string or return the value if already an object.
 */
export function safeParse(val: unknown): IDataObject | undefined {
  if (val === null || val === undefined || val === '' || val === '{}') return undefined;
  if (typeof val === 'object') return val as IDataObject;
  try {
    const parsed = JSON.parse(val as string);
    if (typeof parsed === 'object' && parsed !== null) return parsed as IDataObject;
  } catch {
    // ignore parse errors
  }
  return undefined;
}
