import { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class NotifyApi implements ICredentialType {
  name = 'notifyApi';
  icon: Icon = { light: 'file:../icons/notify.svg', dark: 'file:../icons/notify.dark.svg' };
  displayName = 'Notify API';
  documentationUrl = 'https://bcgov.github.io/common-hosted-workflow/community-nodes/notify/credentials';
  properties: INodeProperties[] = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: '',
      required: true,
      placeholder: 'https://notify-api.example.ca',
      description:
        'Base URL of the Notify API gateway (e.g. https://notify-api.example.ca). Set your environment gateway URL; no production host is hardcoded.',
    },
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'Notify API key sent as the X-API-KEY header on versioned calls. Never logged or echoed.',
    },
  ];
}
