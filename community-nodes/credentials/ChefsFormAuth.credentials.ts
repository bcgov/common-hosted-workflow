import type {
  Icon,
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class ChefsFormAuth implements ICredentialType {
  name = 'chefsFormAuth';
  icon: Icon = { light: 'file:../icons/file-search.svg', dark: 'file:../icons/file-search.dark.svg' };
  displayName = 'CHEFS Form Authentication';
  documentationUrl =
    'https://developer.gov.bc.ca/docs/default/component/chefs-techdocs/Capabilities/Integrations/Embedding-Webcomponent/#getting-an-auth-token';
  // Build the Basic auth header with n8n's native string .toBase64() helper.
  // The expression sandbox does NOT expose Node's `Buffer`, so Buffer.from(...)
  // silently produced an empty header and the gateway returned 401.
  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '=Basic {{ ($credentials.formId + ":" + $credentials.apiKey).base64Encode() }}',
      },
    },
  };
  test: ICredentialTestRequest = {
    request: {
      method: 'POST',
      // The gateway token endpoint lives at the app root (sibling of /api/v1), e.g.
      // https://<host>/app/gateway/v1/auth/token/forms/<formId>. Strip a trailing
      // /api/v1 (and any trailing slash) from the configured Base URL to reach it.
      url: '={{$credentials.baseUrl.replace(/\\/api\\/v1\\/?$/, "").replace(/\\/$/, "")}}/gateway/v1/auth/token/forms/{{$credentials.formId}}',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        formId: '={{$credentials.formId}}',
      },
    },
  };
  properties: INodeProperties[] = [
    {
      displayName: 'Form Name',
      name: 'formName',
      type: 'string',
      default: '',
      required: false,
      description: 'A friendly name to identify this form credential (not used in API requests)',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://submit.digital.gov.bc.ca/app/api/v1',
      placeholder: 'https://submit.digital.gov.bc.ca/app/api/v1',
      description: 'Base URL of the CHEFS API',
    },
    {
      displayName: 'Form ID',
      name: 'formId',
      type: 'string',
      default: '',
      description: 'The CHEFS Form ID (used as Basic Auth username)',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'The CHEFS API Key for the form (used as Basic Auth password)',
    },
  ];
}
