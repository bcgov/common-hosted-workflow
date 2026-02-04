import { IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

export async function includeAuthorizationHeader(
  this: IExecuteSingleFunctions,
  requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
  const formId = this.getNodeParameter('formID', '') as string;
  const credentials = await this.getCredentials('chefsApi');
  const token = Buffer.from(`${formId}:${credentials.apiKey}`).toString('base64');

  requestOptions.headers = requestOptions.headers || {};
  requestOptions.headers.authorization = `Basic ${token}`;
  return requestOptions;
}
