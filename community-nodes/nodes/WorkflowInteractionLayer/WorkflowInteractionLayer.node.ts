import {
  NodeConnectionTypes,
  NodeApiError,
  NodeOperationError,
  type INodeType,
  type INodeTypeDescription,
  type IExecuteFunctions,
  type IWebhookFunctions,
  type IWebhookResponseData,
  type INodeExecutionData,
  type IDataObject,
  type JsonObject,
} from 'n8n-workflow';
import { createMessage, listMessages, getMessagesByActor } from './operations/message.operations';
import {
  createAction,
  createActionAndWait,
  getAction,
  getActionsByActor,
  listActions,
  updateAction,
} from './operations/action.operations';
import {
  messageCreateProperties,
  messageGetByActorProperties,
  messageListProperties,
  actionCreateProperties,
  actionGetProperties,
  actionGetByActorProperties,
  actionListProperties,
  actionUpdateProperties,
  ACTION_CREATE_OPERATIONS,
} from './shared/properties';

// eslint-disable-next-line @n8n/community-nodes/webhook-lifecycle-complete
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
    // Only used by the "Create, Wait and Get Data" operation, which locks the action's
    // callback to this URL and pauses the execution until the WIL backend calls it back.
    waitingNodeTooltip:
      '={{ "Waiting for the actor to complete the action at: <a href=\\"" + $execution.resumeUrl + "\\" target=\\"_blank\\">" + $execution.resumeUrl + "</a>" }}',
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        responseData: '',
        path: '',
        restartWebhook: true,
      },
    ],
    credentials: [
      {
        // Always required — authenticates WIL API calls (action creation). Shown at the
        // top of the node's credentials section for every resource/operation.
        name: 'workflowInteractionLayerApi',
        required: true,
      },
      {
        // Only required for the "Show Form" action type, where the WIL API needs the
        // CHEFS form ID/API key to render and submit the form. n8n renders this as a
        // second entry in the same top credentials section, hidden otherwise.
        name: 'chefsFormAuth',
        required: true,
        displayOptions: {
          show: { resource: ['action'], operation: ACTION_CREATE_OPERATIONS, actionType: ['showform'] },
        },
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
          {
            name: 'Create, Wait and Get Data',
            value: 'createAndWait',
            action: 'Create an action and wait for the actor to complete it',
          },
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

    // Puts the whole execution to wait, so it's handled once up front rather than per item.
    if (resource === 'action' && operation === 'createAndWait') {
      try {
        return [this.helpers.returnJsonArray(await createActionAndWait(this, 0))];
      } catch (error) {
        throwMappedError(this, error, 0);
      }
    }

    for (const [i] of items.entries()) {
      try {
        const responseData = await dispatchOperation(this, resource, operation, i);
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
        throwMappedError(this, error, i);
      }
    }

    return [returnData];
  }

  /**
   * Resume handler for the "Create, Wait and Get Data" operation. WIL calls this URL
   * (set as the action's callback) once the actor completes the action; the callback
   * body becomes this node's output. Marks `wilActionStatus` completed in the execution's
   * custom data so downstream nodes can tell this apart from a local-timeout resume, which
   * never reaches this handler and leaves `wilActionStatus` at "waiting".
   *
   * IWebhookFunctions has no `getWorkflowDataProxy`, so the same `$execution.customData.set(...)`
   * that `createActionAndWait` calls directly is triggered here via `evaluateExpression` instead —
   * it runs in the same expression sandbox that resolves `{{ $execution.customData.get(...) }}`.
   */
  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const body = this.getBodyData() as IDataObject;
    this.evaluateExpression('{{ $execution.customData.set("wilActionStatus", "completed") }}');
    return {
      webhookResponse: { status: 'received' },
      workflowData: [this.helpers.returnJsonArray(body)],
    };
  }
}

async function dispatchOperation(
  ctx: IExecuteFunctions,
  resource: string,
  operation: string,
  i: number,
): Promise<unknown> {
  if (resource === 'message') {
    if (operation === 'create') return createMessage(ctx, i);
    if (operation === 'list') return listMessages(ctx, i);
    if (operation === 'getByActor') return getMessagesByActor(ctx, i);
    return undefined;
  }
  if (resource === 'action') {
    if (operation === 'create') return createAction(ctx, i);
    if (operation === 'get') return getAction(ctx, i);
    if (operation === 'getByActor') return getActionsByActor(ctx, i);
    if (operation === 'list') return listActions(ctx, i);
    if (operation === 'update') return updateAction(ctx, i);
    return undefined;
  }
  return undefined;
}

function throwMappedError(ctx: IExecuteFunctions, error: unknown, itemIndex: number): never {
  if ((error as Error & { response?: unknown }).response) {
    throw new NodeApiError(ctx.getNode(), error as unknown as JsonObject);
  }
  throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex });
}
