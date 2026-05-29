import {
  IExecuteFunctions,
  IWebhookFunctions,
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  NodeOperationError,
} from 'n8n-workflow';

interface ExpectedCall {
  queryParam: string;
  queryValue: string;
}

/**
 * In-memory store for tracking received webhook callbacks per execution.
 * Keyed by execution ID, value is a map of matchKey → call data.
 * This persists across restartWebhook calls because the module stays loaded.
 */
const receivedCallsStore = new Map<string, Record<string, IDataObject>>();

/**
 * Sends the notify request to an external system with the callback URLs.
 */
async function sendNotification(
  context: IExecuteFunctions,
  notifyUrl: string,
  notifyBody: Record<string, unknown>,
): Promise<void> {
  try {
    await context.helpers.httpRequest({
      method: 'POST',
      url: notifyUrl,
      body: notifyBody,
      json: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new NodeOperationError(context.getNode(), `Failed to notify external system: ${message}`);
  }
}

export class MultiWebhookWait implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Multi Webhook Wait Node',
    name: 'multiWebhookWait',
    icon: {
      light: 'file:../../icons/multi-webhook-wait.svg',
      dark: 'file:../../icons/multi-webhook-wait.dark.svg',
    },
    group: ['transform'],
    version: 1,
    subtitle: '=Wait for {{$parameter["expectedCalls"].length}} webhook calls',
    description:
      'Pauses the workflow and waits for multiple webhook callbacks before resuming. Each expected callback is defined by a query parameter and value pair.',
    defaults: {
      name: 'Multi Webhook Wait Node',
    },
    inputs: ['main'],
    outputs: ['main'],
    webhooks: [
      {
        name: 'default',
        httpMethod: '={{$parameter["webhookMethod"]}}',
        responseMode: 'onReceived',
        path: '',
        restartWebhook: true,
      },
    ],
    properties: [
      {
        displayName: 'Expected Calls',
        name: 'expectedCalls',
        type: 'fixedCollection',
        typeOptions: {
          multipleValues: true,
        },
        default: {},
        placeholder: 'Add Expected Call',
        description: 'Define each expected webhook callback by its query parameter and value',
        options: [
          {
            name: 'calls',
            displayName: 'Call',
            values: [
              {
                displayName: 'Query Parameter',
                name: 'queryParam',
                type: 'string',
                default: 'actor',
                required: true,
                description: 'The query parameter name to match (e.g. "actor")',
              },
              {
                displayName: 'Query Value',
                name: 'queryValue',
                type: 'string',
                default: '',
                required: true,
                description: 'The expected value for this callback (e.g. "amina")',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Webhook Method',
        name: 'webhookMethod',
        type: 'options',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
        ],
        default: 'POST',
        description: 'HTTP method the webhook callbacks will use',
      },
      {
        displayName: 'Limit Wait Time',
        name: 'limitWaitTime',
        type: 'boolean',
        default: false,
        description: 'Whether to set a maximum time to wait before the execution resumes automatically',
      },
      {
        displayName: 'Timeout (Minutes)',
        name: 'timeoutMinutes',
        type: 'number',
        default: 1440,
        displayOptions: {
          show: {
            limitWaitTime: [true],
          },
        },
        description: 'Minutes to wait before the execution times out and resumes with partial data',
      },
      {
        displayName: 'Notify External System About Callback URLs',
        name: 'enableNotify',
        type: 'boolean',
        default: false,
        description: 'Whether to POST the list of callback URLs to an external system when the node starts waiting',
      },
      {
        displayName: 'Notify URL',
        name: 'notifyUrl',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            enableNotify: [true],
          },
        },
        description: 'The URL to POST the callback URLs to',
      },
      {
        displayName: 'Additional Data',
        name: 'additionalData',
        type: 'json',
        default: '={}',
        displayOptions: {
          show: {
            enableNotify: [true],
          },
        },
        description: 'Extra JSON payload to include when notifying the external system',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();

    const expectedCallsRaw = this.getNodeParameter('expectedCalls', 0) as IDataObject;
    const expectedCalls = (expectedCallsRaw.calls as ExpectedCall[]) || [];
    const limitWaitTime = this.getNodeParameter('limitWaitTime', 0, false) as boolean;
    const enableNotify = this.getNodeParameter('enableNotify', 0, false) as boolean;

    if (expectedCalls.length < 1) {
      throw new NodeOperationError(this.getNode(), 'At least one expected call must be defined');
    }

    // Build the base resume URL
    const baseResumeUrl = this.evaluateExpression('{{ $execution.resumeUrl }}', 0) as string;
    const executionId = this.evaluateExpression('{{ $execution.id }}', 0) as string;

    // Initialize the in-memory store for this execution
    receivedCallsStore.set(executionId, {});

    // Generate individual callback URLs based on expected calls
    const separator = baseResumeUrl.includes('?') ? '&' : '?';
    const callbackUrls: string[] = [];
    for (const call of expectedCalls) {
      callbackUrls.push(`${baseResumeUrl}${separator}${call.queryParam}=${encodeURIComponent(call.queryValue)}`);
    }

    // Optionally notify an external system with the callback URLs
    if (enableNotify) {
      const notifyUrl = this.getNodeParameter('notifyUrl', 0, '') as string;
      const additionalData = this.getNodeParameter('additionalData', 0, '{}') as string;

      let extraData: object = {};
      try {
        extraData = typeof additionalData === 'string' ? JSON.parse(additionalData) : additionalData;
      } catch {
        throw new NodeOperationError(this.getNode(), 'Invalid JSON in Additional Data field');
      }

      const notifyBody: Record<string, unknown> = {
        callback_urls: callbackUrls,
        expected_calls: expectedCalls,
        ...extraData,
      };

      await sendNotification(this, notifyUrl, notifyBody);
    }

    // Put execution to wait
    const WAIT_INDEFINITELY = new Date('3000-01-01T00:00:00.000Z');
    let waitTill = WAIT_INDEFINITELY;
    if (limitWaitTime) {
      const timeoutMinutes = this.getNodeParameter('timeoutMinutes', 0, 1440) as number;
      waitTill = new Date(Date.now() + timeoutMinutes * 60 * 1000);
    }
    await this.putExecutionToWait(waitTill);

    return [items];
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const query = this.getQueryData();
    const body = this.getBodyData();
    const expectedCallsRaw = this.getNodeParameter('expectedCalls') as IDataObject;
    const expectedCalls = (expectedCallsRaw.calls as ExpectedCall[]) || [];

    // Get execution ID from the request URL
    const req = this.getRequestObject();
    const executionId = extractExecutionId(req.originalUrl);

    // Get or initialize the received calls for this execution
    if (!receivedCallsStore.has(executionId)) {
      receivedCallsStore.set(executionId, {});
    }
    const receivedCalls = receivedCallsStore.get(executionId) ?? {};

    // Match this incoming call against expected calls
    const queryData = query as Record<string, unknown>;
    const matchKey = findMatchingCall(queryData, expectedCalls);

    if (matchKey) {
      receivedCalls[matchKey] = {
        matchKey,
        receivedAt: new Date().toISOString(),
        body,
        query: queryData,
      };
      // Update the store reference in case we used the fallback
      receivedCallsStore.set(executionId, receivedCalls);
    }

    const receivedCount = Object.keys(receivedCalls).length;
    const totalExpected = expectedCalls.length;
    const allReceived = receivedCount >= totalExpected;

    if (!allReceived) {
      const pending = expectedCalls
        .filter((c) => !Object.prototype.hasOwnProperty.call(receivedCalls, `${c.queryParam}=${c.queryValue}`))
        .map((c) => `${c.queryParam}=${c.queryValue}`);

      return {
        webhookResponse: {
          status: 'accepted',
          message: `Callback received (${matchKey || 'unknown'}). Waiting for ${totalExpected - receivedCount} more.`,
          received: receivedCount,
          expected: totalExpected,
          pending,
        },
      };
    }

    // All calls received — resume the workflow
    const output: IDataObject = {
      status: 'complete',
      expected: totalExpected,
      received: receivedCount,
      calls: receivedCalls,
    };

    // Clean up the in-memory store
    receivedCallsStore.delete(executionId);

    return {
      workflowData: [this.helpers.returnJsonArray(output)],
    };
  }
}

/**
 * Finds which expected call matches the incoming query parameters.
 * Returns a match key like "actor=amina" or null if no match.
 */
function findMatchingCall(queryData: Record<string, unknown>, expectedCalls: ExpectedCall[]): string | null {
  for (const call of expectedCalls) {
    const value = queryData[call.queryParam];
    if (value !== undefined && String(value) === call.queryValue) {
      return `${call.queryParam}=${call.queryValue}`;
    }
  }
  return null;
}

/**
 * Extracts the execution ID from the webhook-waiting URL path.
 * URL format: /webhook-waiting/<executionId>
 */
function extractExecutionId(url: string): string {
  const regex = /webhook-waiting\/([^/?]+)/;
  const match = regex.exec(url);
  return match ? match[1] : 'unknown';
}
