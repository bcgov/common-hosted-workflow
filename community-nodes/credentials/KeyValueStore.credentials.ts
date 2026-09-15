import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class KeyValueStore implements ICredentialType {
  name = 'keyValueStore';
  icon: Icon = { light: 'file:../icons/shield-lock.svg', dark: 'file:../icons/shield-lock.dark.svg' };
  displayName = 'Key Value Store';
  documentationUrl = 'https://github.com/bcgov/common-hosted-workflow';
  properties: INodeProperties[] = [
    {
      displayName: 'Pairs',
      name: 'pairs',
      type: 'fixedCollection',
      default: { values: [{ name: '', value: '' }] },
      typeOptions: { multipleValues: true },
      placeholder: 'Add Pair',
      description: 'Dynamic list of key-value pairs stored as a credential',
      options: [
        {
          displayName: 'Pair',
          name: 'values',
          values: [
            {
              displayName: 'Key',
              name: 'name',
              type: 'string',
              default: '',
              description: 'Key name used in the output object',
            },
            {
              displayName: 'Value',
              name: 'value',
              type: 'string',
              typeOptions: { password: true },
              default: '',
              description: 'Value stored for the key',
            },
          ],
        },
      ],
    },
  ];
}
