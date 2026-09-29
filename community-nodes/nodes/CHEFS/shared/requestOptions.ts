import { IExecuteSingleFunctions, IHttpRequestOptions, NodeOperationError } from 'n8n-workflow';
import { timingSafeEqual } from 'node:crypto';

export async function includeAuthorizationHeader(
  this: IExecuteSingleFunctions,
  requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
  const requireText = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new NodeOperationError(this.getNode(), `${label} must be a nonblank string`);
    }
    return value;
  };

  const resource = this.getNodeParameter('resource', '');
  const operation = this.getNodeParameter('operation', '');
  const isSubmission =
    (resource === 'submission' && operation === 'get') ||
    (resource === 'status' && operation === 'includeAuthorizationHeaderStatuses');
  if (!isSubmission && !(resource === 'status' && operation === 'getFormStatuses')) {
    throw new NodeOperationError(this.getNode(), 'Unsupported CHEFS resource/operation selection');
  }

  const formId = requireText(this.getNodeParameter('formID', ''), 'Form ID (formID)');
  if (isSubmission) {
    requireText(this.getNodeParameter('submissionID', ''), 'Submission ID (submissionID)');
  }
  const authorizationToken = requireText(this.getNodeParameter('authorizationToken', ''), 'Node Authorization Token');
  const credentials = await this.getCredentials('chefsApi');
  const credentialToken = requireText(credentials.authorizationToken, 'Credential Authorization Token');
  const apiKey = requireText(credentials.apiKey, 'Credential API Key');

  // Whitespace is only inspected to reject blank inputs, never normalized for comparison.
  const supplied = Buffer.from(authorizationToken, 'utf8');
  const expected = Buffer.from(credentialToken, 'utf8');

  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new NodeOperationError(this.getNode(), 'Authorization failed: Token mismatch', {
      description:
        'The node Authorization Token must match the credential Authorization Token exactly, including case and whitespace.',
    });
  }

  // Only upstream form credentials are sent. The local authorization tokens stay local.
  const token = Buffer.from(`${formId}:${apiKey}`, 'utf8').toString('base64');
  requestOptions.headers = requestOptions.headers || {};
  requestOptions.headers.authorization = `Basic ${token}`;
  return requestOptions;
}
