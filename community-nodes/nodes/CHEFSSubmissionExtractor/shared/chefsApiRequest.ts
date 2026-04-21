import type { IExecuteFunctions, IHttpRequestMethods } from 'n8n-workflow';
import type { ChefsFormCredentials, ChefsSubmissionResponse } from './types';

/**
 * Make an authenticated HTTP request to the CHEFS API.
 * Builds a Basic Auth header from the credential's form ID and API key.
 */
export async function chefsApiRequest(
  ctx: IExecuteFunctions,
  method: IHttpRequestMethods,
  path: string,
  credentials: ChefsFormCredentials,
): Promise<ChefsSubmissionResponse> {
  const token = Buffer.from(`${credentials.formId}:${credentials.apiKey}`).toString('base64');

  const response = await ctx.helpers.httpRequest({
    method,
    url: `${credentials.baseUrl.replace(/\/$/, '')}${path}`,
    headers: {
      Authorization: `Basic ${token}`,
      Accept: 'application/json',
    },
    json: true,
  });

  return response as ChefsSubmissionResponse;
}
