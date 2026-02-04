import { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class ChefsApi implements ICredentialType {
  name = 'chefsApi';
  icon: Icon = { light: 'file:../icons/chefs.svg', dark: 'file:../icons/chefs.dark.svg' };
  displayName = 'CHEFS API';
  documentationUrl = 'https://github.com/bcgov/common-hosted-form-service/wiki';
  properties: INodeProperties[] = [
    // {
    //   displayName: 'Form ID',
    //   name: 'formId',
    //   type: 'string',
    //   typeOptions: { password: false },
    //   default: '',
    // },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
    },
  ];
}
