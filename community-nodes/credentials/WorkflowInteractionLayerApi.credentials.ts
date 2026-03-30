import { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class WorkflowInteractionLayerApi implements ICredentialType {
  name = 'workflowInteractionLayerApi';
  icon: Icon = { light: 'file:../icons/bcgov.png', dark: 'file:../icons/bcgov.png' };
  displayName = 'Workflow Interaction Layer API';
  documentationUrl = '';
  properties: INodeProperties[] = [
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'http://localhost:5678',
      description: 'Base URL of the n8n instance (e.g. http://localhost:5678)',
    },
    {
      displayName: 'n8n API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'n8n API key for authentication',
    },
    {
      displayName: 'Tenant ID',
      name: 'tenantId',
      type: 'string',
      default: '',
      required: true,
      description: 'Tenant identifier sent as X-Tenant-Id header on every request',
    },
    {
      displayName: 'Allowed HTTP Request Domains',
      name: 'allowedDomain',
      type: 'options',
      options: [
        {
          name: 'All',
          value: 'all',
          description: 'Allow all requests when used in the HTTP Request node',
        },
        {
          name: 'Specific Domains',
          value: 'specificDomains',
          description: 'Restrict requests to specific domains',
        },
        {
          name: 'None',
          value: 'none',
          description: 'Block all requests when used in the HTTP Request node',
        },
      ],
      default: 'all',
    },
    {
      displayName: 'Allowed Domains',
      name: 'allowedDomainsList',
      type: 'string',
      default: '',
      placeholder: 'example.com, *.subdomain.com',
      description: 'Comma-separated list of allowed domains',
      displayOptions: {
        show: {
          allowedDomain: ['specificDomains'],
        },
      },
    },
  ];
}
