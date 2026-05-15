import { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class DevXConnector implements ICredentialType {
  name = 'devXConnector';
  icon: Icon = { light: 'file:../icons/message-2-code.svg', dark: 'file:../icons/message-2-code.dark.svg' };
  displayName = 'DevX Message Connector';
  documentationUrl = 'https://github.com/bcgov/common-hosted-workflow';
  properties: INodeProperties[] = [
    {
      displayName: 'Teams Channel Link',
      name: 'channelLink',
      type: 'string',
      typeOptions: { password: true },
      default: '',
    },
  ];
}
