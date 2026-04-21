import type { Icon, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class ChefsFormAuth implements ICredentialType {
  name = 'chefsFormAuth';
  icon: Icon = { light: 'file:../icons/chefs.svg', dark: 'file:../icons/chefs.dark.svg' };
  displayName = 'CHEFS Form Authentication';
  documentationUrl = 'https://github.com/bcgov/common-hosted-form-service/wiki';
  test: ICredentialTestRequest = {
    request: {
      method: 'GET',
      url: '={{$credentials.baseUrl}}/forms/{{$credentials.formId}}',
      headers: {
        Authorization: '=Basic {{Buffer.from($credentials.formId + ":" + $credentials.apiKey).toString("base64")}}',
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
