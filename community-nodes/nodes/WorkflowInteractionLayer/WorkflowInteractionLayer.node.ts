import {
  NodeConnectionTypes,
  NodeApiError,
  NodeOperationError,
  type INodeType,
  type INodeTypeDescription,
  type IExecuteFunctions,
  type INodeExecutionData,
  type IDataObject,
  type JsonObject,
} from 'n8n-workflow';
import { wilApiRequest, safeParse } from './shared/GenericFunctions';

export class WorkflowInteractionLayer implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Workflow Interaction Layer',
    name: 'workflowInteractionLayer',
    description: 'Interact with the Workflow Interaction Layer API for messages and actions',
    // eslint-disable-next-line n8n-nodes-base/node-class-description-icon-not-svg, @n8n/community-nodes/icon-validation
    icon: 'file:../../icons/bcgov.png',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    defaults: {
      name: 'Workflow Interaction Layer',
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        // eslint-disable-next-line @n8n/community-nodes/no-credential-reuse
        name: 'n8nApi',
        required: true,
      },
    ],
    properties: [
      // ── Resource selector ──
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Message', value: 'message' },
          { name: 'Action', value: 'action' },
        ],
        default: 'message',
      },

      // ── Message operations ──
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['message'] } },
        options: [
          { name: 'Create', value: 'create', action: 'Create a message' },
          { name: 'Read', value: 'read', action: 'Read a message' },
          { name: 'Get Many', value: 'list', action: 'Get many messages' },
        ],
        default: 'create',
      },

      // ── Action operations ──
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['action'] } },
        options: [
          { name: 'Create', value: 'create', action: 'Create an action' },
          { name: 'Delete', value: 'delete', action: 'Delete an action' },
          { name: 'Get', value: 'get', action: 'Get an action' },
          { name: 'Get Many', value: 'list', action: 'Get many actions' },
          { name: 'Update', value: 'update', action: 'Update an action' },
        ],
        default: 'create',
      },

      // ═══════════════════════════════════════
      // Create Message fields
      // ═══════════════════════════════════════
      {
        displayName:
          'Workflow ID and Workflow Instance ID are automatically set from the current workflow and execution context',
        name: 'autoFieldsNoticeMessage',
        type: 'notice',
        default: '',
        displayOptions: { show: { resource: ['message'], operation: ['create'] } },
      },
      {
        displayName: 'Actor ID',
        name: 'actorId',
        type: 'string',
        default: '',
        required: true,
        description: 'Identifier for the target actor (max 50 characters)',
        displayOptions: { show: { resource: ['message'], operation: ['create'] } },
      },
      {
        displayName: 'Actor Type',
        name: 'actorType',
        type: 'options',
        default: 'user',
        required: true,
        options: [
          { name: 'Group', value: 'group' },
          { name: 'Other', value: 'other' },
          { name: 'Role', value: 'role' },
          { name: 'System', value: 'system' },
          { name: 'User', value: 'user' },
        ],
        displayOptions: { show: { resource: ['message'], operation: ['create'] } },
      },
      {
        displayName: 'Title',
        name: 'title',
        type: 'string',
        default: '',
        required: true,
        description: 'Message title (max 255 characters)',
        displayOptions: { show: { resource: ['message'], operation: ['create'] } },
      },
      {
        displayName: 'Body',
        name: 'body',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        required: true,
        description: 'Message body text',
        displayOptions: { show: { resource: ['message'], operation: ['create'] } },
      },
      {
        displayName: 'Metadata',
        name: 'metadata',
        type: 'json',
        default: '{}',
        description: 'Optional JSON metadata object',
        displayOptions: { show: { resource: ['message'], operation: ['create'] } },
      },

      // ═══════════════════════════════════════
      // Read Message fields
      // ═══════════════════════════════════════
      {
        displayName: 'Message ID',
        name: 'messageId',
        type: 'string',
        default: '',
        required: true,
        description: 'ID of the message to retrieve',
        displayOptions: { show: { resource: ['message'], operation: ['read'] } },
      },

      // ═══════════════════════════════════════
      // List Messages fields
      // ═══════════════════════════════════════
      {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        description: 'Whether to return all results or only up to a given limit',
        displayOptions: { show: { resource: ['message'], operation: ['list'] } },
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 200 },
        default: 50,
        description: 'Max number of results to return',
        displayOptions: { show: { resource: ['message'], operation: ['list'], returnAll: [false] } },
      },
      {
        displayName: 'Actor ID',
        name: 'actorId',
        type: 'string',
        default: '',
        description: 'Filter by actor ID',
        displayOptions: { show: { resource: ['message'], operation: ['list'] } },
      },
      {
        displayName: 'Actor Type',
        name: 'actorType',
        type: 'options',
        default: 'user',
        options: [
          { name: 'Group', value: 'group' },
          { name: 'Other', value: 'other' },
          { name: 'Role', value: 'role' },
          { name: 'System', value: 'system' },
          { name: 'User', value: 'user' },
        ],
        description: 'Filter by actor type',
        displayOptions: { show: { resource: ['message'], operation: ['list'] } },
      },
      {
        displayName: 'Workflow Instance ID',
        name: 'workflowInstanceId',
        type: 'string',
        default: '',
        description: 'Filter by workflow instance ID',
        displayOptions: { show: { resource: ['message'], operation: ['list'] } },
      },
      {
        displayName: 'Offset',
        name: 'offset',
        type: 'number',
        typeOptions: { minValue: 0 },
        default: 0,
        description: 'Number of results to skip for pagination',
        displayOptions: { show: { resource: ['message'], operation: ['list'] } },
      },

      // ═══════════════════════════════════════
      // Create Action fields
      // ═══════════════════════════════════════
      {
        displayName:
          'Workflow ID and Workflow Instance ID are automatically set from the current workflow and execution context',
        name: 'autoFieldsNoticeAction',
        type: 'notice',
        default: '',
        displayOptions: { show: { resource: ['action'], operation: ['create'] } },
      },
      {
        displayName: 'Actor ID',
        name: 'actorId',
        type: 'string',
        default: '',
        required: true,
        description: 'Identifier for the target actor (max 50 characters)',
        displayOptions: { show: { resource: ['action'], operation: ['create'] } },
      },
      {
        displayName: 'Actor Type',
        name: 'actorType',
        type: 'options',
        default: 'user',
        required: true,
        options: [
          { name: 'Group', value: 'group' },
          { name: 'Other', value: 'other' },
          { name: 'Role', value: 'role' },
          { name: 'System', value: 'system' },
          { name: 'User', value: 'user' },
        ],
        displayOptions: { show: { resource: ['action'], operation: ['create'] } },
      },
      {
        displayName: 'Action Type',
        name: 'actionType',
        type: 'options',
        default: 'getapproval',
        required: true,
        options: [
          { name: 'Get Approval', value: 'getapproval' },
          { name: 'Show Form', value: 'showform' },
          { name: 'Wait on Event', value: 'waitonevent' },
        ],
        description: 'The type of action to create',
        displayOptions: { show: { resource: ['action'], operation: ['create'] } },
      },
      {
        displayName: 'Payload',
        name: 'payload',
        type: 'json',
        default: '{}',
        required: true,
        description: 'For "showform": include formId, formVersion, returnUrl. For "getapproval": free-form JSON.',
        displayOptions: { show: { resource: ['action'], operation: ['create'] } },
      },
      {
        displayName: 'Callback URL',
        name: 'callbackUrl',
        type: 'string',
        default: '',
        required: true,
        description: 'URL to call when the action is completed',
        displayOptions: { show: { resource: ['action'], operation: ['create'] } },
      },
      {
        displayName: 'Callback Method',
        name: 'callbackMethod',
        type: 'options',
        default: 'POST',
        options: [
          { name: 'POST', value: 'POST' },
          { name: 'PUT', value: 'PUT' },
          { name: 'PATCH', value: 'PATCH' },
        ],
        description: 'HTTP method for the callback',
        displayOptions: { show: { resource: ['action'], operation: ['create'] } },
      },
      {
        displayName: 'Callback Payload Spec',
        name: 'callbackPayloadSpec',
        type: 'json',
        default: '{}',
        description: 'Optional template for expected callback body',
        displayOptions: { show: { resource: ['action'], operation: ['create'] } },
      },
      {
        displayName: 'Due Date',
        name: 'dueDate',
        type: 'string',
        default: '',
        description: 'Optional due date in RFC 3339 format',
        displayOptions: { show: { resource: ['action'], operation: ['create'] } },
      },
      {
        displayName: 'Priority',
        name: 'priority',
        type: 'options',
        default: 'normal',
        options: [
          { name: 'Critical', value: 'critical' },
          { name: 'Normal', value: 'normal' },
        ],
        displayOptions: { show: { resource: ['action'], operation: ['create'] } },
      },
      {
        displayName: 'Check In',
        name: 'checkIn',
        type: 'string',
        default: '',
        description: 'Optional reminder timestamp in RFC 3339 format',
        displayOptions: { show: { resource: ['action'], operation: ['create'] } },
      },
      {
        displayName: 'Metadata',
        name: 'metadata',
        type: 'json',
        default: '{}',
        description: 'Optional JSON metadata object',
        displayOptions: { show: { resource: ['action'], operation: ['create'] } },
      },

      // ═══════════════════════════════════════
      // Get Action fields
      // ═══════════════════════════════════════
      {
        displayName: 'Action ID',
        name: 'actionId',
        type: 'string',
        default: '',
        required: true,
        description: 'ID of the action to retrieve',
        displayOptions: { show: { resource: ['action'], operation: ['get'] } },
      },

      // ═══════════════════════════════════════
      // List Actions fields
      // ═══════════════════════════════════════
      {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        default: false,
        description: 'Whether to return all results or only up to a given limit',
        displayOptions: { show: { resource: ['action'], operation: ['list'] } },
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 200 },
        default: 50,
        description: 'Max number of results to return',
        displayOptions: { show: { resource: ['action'], operation: ['list'], returnAll: [false] } },
      },
      {
        displayName: 'Actor ID',
        name: 'actorId',
        type: 'string',
        default: '',
        description: 'Filter by actor ID',
        displayOptions: { show: { resource: ['action'], operation: ['list'] } },
      },
      {
        displayName: 'Actor Type',
        name: 'actorType',
        type: 'options',
        default: 'user',
        options: [
          { name: 'Group', value: 'group' },
          { name: 'Other', value: 'other' },
          { name: 'Role', value: 'role' },
          { name: 'System', value: 'system' },
          { name: 'User', value: 'user' },
        ],
        description: 'Filter by actor type',
        displayOptions: { show: { resource: ['action'], operation: ['list'] } },
      },
      {
        displayName: 'Workflow Instance ID',
        name: 'workflowInstanceId',
        type: 'string',
        default: '',
        description: 'Filter by workflow instance ID',
        displayOptions: { show: { resource: ['action'], operation: ['list'] } },
      },
      {
        displayName: 'Since',
        name: 'since',
        type: 'string',
        default: '',
        description: 'Filter actions created after this RFC 3339 timestamp',
        displayOptions: { show: { resource: ['action'], operation: ['list'] } },
      },
      {
        displayName: 'Offset',
        name: 'offset',
        type: 'number',
        typeOptions: { minValue: 0 },
        default: 0,
        description: 'Number of results to skip for pagination',
        displayOptions: { show: { resource: ['action'], operation: ['list'] } },
      },

      // ═══════════════════════════════════════
      // Update Action fields
      // ═══════════════════════════════════════
      {
        displayName: 'Action ID',
        name: 'actionId',
        type: 'string',
        default: '',
        required: true,
        description: 'ID of the action to update',
        displayOptions: { show: { resource: ['action'], operation: ['update'] } },
      },
      {
        displayName: 'Status',
        name: 'status',
        type: 'options',
        default: 'pending',
        options: [
          { name: 'Cancelled', value: 'cancelled' },
          { name: 'Completed', value: 'completed' },
          { name: 'Deleted', value: 'deleted' },
          { name: 'Expired', value: 'expired' },
          { name: 'In Progress', value: 'in_progress' },
          { name: 'Pending', value: 'pending' },
        ],
        description: 'New status for the action',
        displayOptions: { show: { resource: ['action'], operation: ['update'] } },
      },
      {
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        displayOptions: { show: { resource: ['action'], operation: ['update'] } },
        options: [
          {
            displayName: 'Check In',
            name: 'checkIn',
            type: 'string',
            default: '',
            description: 'Updated reminder timestamp in RFC 3339 format',
          },
          {
            displayName: 'Due Date',
            name: 'dueDate',
            type: 'string',
            default: '',
            description: 'Updated due date in RFC 3339 format',
          },
          {
            displayName: 'Metadata',
            name: 'metadata',
            type: 'json',
            default: '',
            description: 'Updated metadata JSON object',
          },
          {
            displayName: 'Payload',
            name: 'payload',
            type: 'json',
            default: '',
            description: 'Updated payload JSON',
          },
          {
            displayName: 'Priority',
            name: 'priority',
            type: 'options',
            default: 'normal',
            options: [
              { name: 'Critical', value: 'critical' },
              { name: 'Normal', value: 'normal' },
            ],
            description: 'Updated priority',
          },
        ],
      },

      // ═══════════════════════════════════════
      // Delete Action fields
      // ═══════════════════════════════════════
      {
        displayName: 'Action ID',
        name: 'actionId',
        type: 'string',
        default: '',
        required: true,
        description: 'ID of the action to delete',
        displayOptions: { show: { resource: ['action'], operation: ['delete'] } },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;

    // Auto-resolved context — available to all operations
    const workflow = this.getWorkflow();
    const executionId = this.getExecutionId();

    for (let i = 0; i < items.length; i++) {
      try {
        let responseData: unknown;

        // ═══════════════════════════════════════
        // MESSAGE
        // ═══════════════════════════════════════
        if (resource === 'message') {
          if (operation === 'create') {
            const body: IDataObject = {
              workflowInstanceId: executionId,
              workflowId: workflow.id,
              actorId: this.getNodeParameter('actorId', i) as string,
              actorType: this.getNodeParameter('actorType', i) as string,
              title: this.getNodeParameter('title', i) as string,
              body: this.getNodeParameter('body', i) as string,
            };

            const metadata = safeParse(this.getNodeParameter('metadata', i, '{}'));
            if (metadata) body.metadata = metadata;

            responseData = await wilApiRequest(this, 'POST', '/messages', body);
          } else if (operation === 'read') {
            const messageId = this.getNodeParameter('messageId', i) as string;
            responseData = await wilApiRequest(this, 'GET', `/messages/${messageId}`);
          } else if (operation === 'list') {
            const query: IDataObject = {};
            const returnAll = this.getNodeParameter('returnAll', i) as boolean;

            if (!returnAll) {
              query.limit = this.getNodeParameter('limit', i) as number;
            }

            const actorId = this.getNodeParameter('actorId', i, '') as string;
            if (actorId) query.actorId = actorId;

            const actorType = this.getNodeParameter('actorType', i, '') as string;
            if (actorType) query.actorType = actorType;

            const workflowInstanceId = this.getNodeParameter('workflowInstanceId', i, '') as string;
            if (workflowInstanceId) query.workflowInstanceId = workflowInstanceId;

            const offset = this.getNodeParameter('offset', i, 0) as number;
            if (offset > 0) query.offset = offset;

            responseData = await wilApiRequest(this, 'GET', '/messages', undefined, query);

            // ═══════════════════════════════════════
            // ACTION
            // ═══════════════════════════════════════
          }
        } else if (resource === 'action') {
          if (operation === 'create') {
            const body: IDataObject = {
              workflowInstanceId: executionId,
              workflowId: workflow.id,
              actorId: this.getNodeParameter('actorId', i) as string,
              actorType: this.getNodeParameter('actorType', i) as string,
              actionType: this.getNodeParameter('actionType', i) as string,
              callbackUrl: this.getNodeParameter('callbackUrl', i) as string,
              callbackMethod: this.getNodeParameter('callbackMethod', i) as string,
            };

            const payload = safeParse(this.getNodeParameter('payload', i, '{}'));
            if (payload) body.payload = payload;

            const callbackPayloadSpec = safeParse(this.getNodeParameter('callbackPayloadSpec', i, '{}'));
            if (callbackPayloadSpec) body.callbackPayloadSpec = callbackPayloadSpec;

            const dueDate = this.getNodeParameter('dueDate', i, '') as string;
            if (dueDate) body.dueDate = dueDate;

            const priority = this.getNodeParameter('priority', i, 'normal') as string;
            if (priority) body.priority = priority;

            const checkIn = this.getNodeParameter('checkIn', i, '') as string;
            if (checkIn) body.checkIn = checkIn;

            const metadata = safeParse(this.getNodeParameter('metadata', i, '{}'));
            if (metadata) body.metadata = metadata;

            responseData = await wilApiRequest(this, 'POST', '/actions', body);
          } else if (operation === 'get') {
            const actionId = this.getNodeParameter('actionId', i) as string;
            responseData = await wilApiRequest(this, 'GET', `/actions/${actionId}`);
          } else if (operation === 'list') {
            const query: IDataObject = {};
            const returnAll = this.getNodeParameter('returnAll', i) as boolean;

            if (!returnAll) {
              query.limit = this.getNodeParameter('limit', i) as number;
            }

            const actorId = this.getNodeParameter('actorId', i, '') as string;
            if (actorId) query.actorId = actorId;

            const actorType = this.getNodeParameter('actorType', i, '') as string;
            if (actorType) query.actorType = actorType;

            const workflowInstanceId = this.getNodeParameter('workflowInstanceId', i, '') as string;
            if (workflowInstanceId) query.workflowInstanceId = workflowInstanceId;

            const since = this.getNodeParameter('since', i, '') as string;
            if (since) query.since = since;

            const offset = this.getNodeParameter('offset', i, 0) as number;
            if (offset > 0) query.offset = offset;

            responseData = await wilApiRequest(this, 'GET', '/actions', undefined, query);
          } else if (operation === 'update') {
            const actionId = this.getNodeParameter('actionId', i) as string;
            const body: IDataObject = {
              status: this.getNodeParameter('status', i) as string,
            };

            const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

            if (additionalFields.checkIn) body.checkIn = additionalFields.checkIn;
            if (additionalFields.dueDate) body.dueDate = additionalFields.dueDate;
            if (additionalFields.priority) body.priority = additionalFields.priority;

            const payload = safeParse(additionalFields.payload);
            if (payload) body.payload = payload;

            const metadata = safeParse(additionalFields.metadata);
            if (metadata) body.metadata = metadata;

            responseData = await wilApiRequest(this, 'PATCH', `/actions/${actionId}`, body);
          } else if (operation === 'delete') {
            const actionId = this.getNodeParameter('actionId', i) as string;
            await wilApiRequest(this, 'DELETE', `/actions/${actionId}`);
            responseData = { deleted: true };
          }
        }

        // Build output with item linking
        const executionData = this.helpers.constructExecutionMetaData(
          this.helpers.returnJsonArray(responseData as IDataObject | IDataObject[]),
          { itemData: { item: i } },
        );
        returnData.push(...executionData);
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message },
            pairedItem: { item: i },
          });
          continue;
        }
        if ((error as Error & { response?: unknown }).response) {
          throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
        }
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
      }
    }

    return [returnData];
  }
}
