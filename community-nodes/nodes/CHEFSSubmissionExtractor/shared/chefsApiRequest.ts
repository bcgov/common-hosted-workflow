import type { IExecuteFunctions, IHttpRequestMethods } from 'n8n-workflow';
import type { ChefsSubmissionResponse } from './types';

/**
 * Make an authenticated HTTP request to the CHEFS API.
 * Builds a Basic Auth header from the form ID and API key.
 */
export async function chefsApiRequest(
  ctx: IExecuteFunctions,
  method: IHttpRequestMethods,
  path: string,
  formId: string,
  apiKey: string,
  domain: string,
): Promise<ChefsSubmissionResponse> {
  const token = Buffer.from(`${formId}:${apiKey}`).toString('base64');

  const response = await ctx.helpers.httpRequest({
    method,
    url: `${domain.replace(/\/$/, '')}${path}`,
    headers: {
      Authorization: `Basic ${token}`,
      Accept: 'application/json',
    },
    json: true,
  });

  return response as ChefsSubmissionResponse;
}
