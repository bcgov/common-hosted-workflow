import { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class ChefsApi implements ICredentialType {
  name = 'chefsApi';
  icon: Icon = { light: 'file:../icons/file-search.svg', dark: 'file:../icons/file-search.dark.svg' };
  displayName = 'CHEFS API';
  documentationUrl = 'https://bcgov.github.io/common-hosted-workflow/community-nodes/chefs/credentials';
  properties: INodeProperties[] = [
    {
      displayName: 'Authorization Token',
      name: 'authorizationToken',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description:
        'Local shared secret checked against the node token exactly, including case and whitespace; not sent to CHEFS',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'CHEFS API key for the node Form ID, sent as the Basic authentication password',
    },
  ];
}
