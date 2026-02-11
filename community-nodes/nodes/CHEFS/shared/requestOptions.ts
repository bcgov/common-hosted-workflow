import { IExecuteSingleFunctions, IHttpRequestOptions, NodeOperationError } from 'n8n-workflow';

export async function includeAuthorizationHeader(
  this: IExecuteSingleFunctions,
  requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
  const formId = this.getNodeParameter('formID', '') as string;
  const authorizationToken = this.getNodeParameter('authorizationToken', '') as string;
  const credentials = await this.getCredentials('chefsApi');
  const token = Buffer.from(`${formId}:${credentials.apiKey}`).toString('base64');

  if (
    !credentials.authorizationToken ||
    String(credentials.authorizationToken).toLowerCase().trim() !== authorizationToken.toLowerCase().trim()
  ) {
    throw new NodeOperationError(this.getNode(), 'Authorization failed: Token mismatch', {
      description:
        'The token provided in the node parameters does not match the token in the credentials. Please verify both values.',
    });
  }

  requestOptions.headers = requestOptions.headers || {};
  requestOptions.headers.authorization = `Basic ${token}`;
  return requestOptions;
}
