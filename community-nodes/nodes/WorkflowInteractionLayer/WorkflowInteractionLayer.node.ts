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
import { createMessage, listMessages, getMessagesByActor } from './operations/message.operations';
import { createAction, getAction, getActionsByActor, listActions, updateAction } from './operations/action.operations';
import {
  messageCreateProperties,
  messageGetByActorProperties,
  messageListProperties,
  actionCreateProperties,
  actionGetProperties,
  actionGetByActorProperties,
  actionListProperties,
  actionUpdateProperties,
} from './shared/properties';

export class WorkflowInteractionLayer implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Workflow Interaction Layer',
    name: 'workflowInteractionLayer',
    description: 'Interact with the Workflow Interaction Layer API for messages and actions',
    icon: { light: 'file:../../icons/message-2-cog.svg', dark: 'file:../../icons/message-2-cog.dark.svg' },
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
        name: 'workflowInteractionLayerApi',
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
          { name: 'Get Messages by Actor ID', value: 'getByActor', action: 'Get messages by actor ID' },
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
          { name: 'Get', value: 'get', action: 'Get an action' },
          { name: 'Get Actions by Actor ID', value: 'getByActor', action: 'Get actions by actor ID' },
          { name: 'Get Many', value: 'list', action: 'Get many actions' },
          { name: 'Update', value: 'update', action: 'Update an action' },
        ],
        default: 'create',
      },

      // ── Message fields ──
      ...messageCreateProperties,
      ...messageGetByActorProperties,
      ...messageListProperties,

      // ── Action fields ──
      ...actionCreateProperties,
      ...actionGetProperties,
      ...actionGetByActorProperties,
      ...actionListProperties,
      ...actionUpdateProperties,
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;

    for (const [i] of items.entries()) {
      try {
        let responseData: unknown;

        if (resource === 'message') {
          if (operation === 'create') responseData = await createMessage(this, i);
          else if (operation === 'list') responseData = await listMessages(this, i);
          else if (operation === 'getByActor') responseData = await getMessagesByActor(this, i);
        } else if (resource === 'action') {
          if (operation === 'create') responseData = await createAction(this, i);
          else if (operation === 'get') responseData = await getAction(this, i);
          else if (operation === 'getByActor') responseData = await getActionsByActor(this, i);
          else if (operation === 'list') responseData = await listActions(this, i);
          else if (operation === 'update') responseData = await updateAction(this, i);
        }

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
