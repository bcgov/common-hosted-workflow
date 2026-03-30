import { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class WorkflowInteractionLayerApi implements ICredentialType {
  name = 'workflowInteractionLayerApi';
  icon: Icon = { light: 'file:../icons/bcgov.png', dark: 'file:../icons/bcgov.png' };
  displayName = 'Workflow Interaction Layer API';
  documentationUrl =
    'https://github.com/bcgov/common-hosted-workflow/tree/main/docs/community-nodes/workflow-interaction-layer';
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
      required: true,
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
  ];
}
