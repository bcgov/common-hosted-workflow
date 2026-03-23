import { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class DevXConnector implements ICredentialType {
  name = 'devXConnector';
  icon: Icon = { light: 'file:../icons/bcgov.png', dark: 'file:../icons/bcgov.png' };
  displayName = 'DevX Message Connector';
  documentationUrl = '';
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
