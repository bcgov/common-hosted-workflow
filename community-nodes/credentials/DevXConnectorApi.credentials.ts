import { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class DevXConnectorApi implements ICredentialType {
  name = 'devXConnectorApi';
  icon: Icon = 'file:../icons/message-2-code.svg';
  displayName = 'DevX Message Connector API';
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
