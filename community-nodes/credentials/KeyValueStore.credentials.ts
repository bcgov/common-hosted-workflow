import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class KeyValueStore implements ICredentialType {
  name = 'keyValueStore';
  icon: Icon = { light: 'file:../icons/shield-lock.svg', dark: 'file:../icons/shield-lock.dark.svg' };
  displayName = 'Key Value Store';
  documentationUrl = 'https://bcgov.github.io/common-hosted-workflow/community-nodes/key-value-store/credentials';
  properties: INodeProperties[] = [
    {
      displayName: 'Pairs',
      name: 'pairs',
      type: 'fixedCollection',
      default: { values: [{ name: '', value: '' }] },
      typeOptions: { multipleValues: true },
      placeholder: 'Add Pair',
      description:
        'String pairs projected into downstream data. Only rows with both fields empty are ignored; invalid rows fail execution.',
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
              description:
                'Unique, nonblank key; __proto__, constructor and prototype are reserved. Whitespace is preserved.',
            },
            {
              displayName: 'Value',
              name: 'value',
              type: 'string',
              typeOptions: { password: true },
              default: '',
              description:
                'String value; empty strings and whitespace are preserved. Masking here does not hide downstream output.',
            },
          ],
        },
      ],
    },
  ];
}
