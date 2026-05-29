import {
  IExecuteFunctions,
  IWebhookFunctions,
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  NodeConnectionTypes,
  NodeOperationError,
} from 'n8n-workflow';

interface ExpectedCall {
  queryParam: string;
  queryValue: string;
}

/** Path for registering multi-webhook waits with the external-hooks service. */
const REGISTER_PATH = '/rest/custom/v1/multi-webhook-wait/register';

/** Path for marking a call as received in the external-hooks service. */
const CALLBACK_PATH_PREFIX = '/rest/custom/v1/multi-webhook-wait/callback';

/** Path for reading the current status of a multi-webhook wait. */
const STATUS_PATH_PREFIX = '/rest/custom/v1/multi-webhook-wait/status';

/** Path for deleting a multi-webhook wait's DB state. */
const CLEANUP_PATH_PREFIX = '/rest/custom/v1/multi-webhook-wait/cleanup';

/**
 * Multi Webhook Wait Node
 *
 * Pauses the workflow and waits for multiple webhook callbacks before resuming.
 * Each expected callback is defined by a query parameter and value pair.
 *
 * Architecture:
 * - On execute: registers expected callbacks with the external-hooks service (DB-backed),
 *   optionally notifies an external system with the callback URLs, then puts execution to wait.
 * - External callers hit the n8n webhook-waiting URL directly with their identifying query params.
 * - The node's webhook() handler calls the external-hooks service to mark each callback as
 *   received and check for completion.
 * - When all callbacks have been received, the webhook handler returns workflowData to resume.
 * - Until then, it returns a 202 response and keeps waiting (restartWebhook: true).
 */
// eslint-disable-next-line @n8n/community-nodes/webhook-lifecycle-complete
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
    usableAsTool: true,
    subtitle: '=Multi Webhook Wait',
    description:
      'Pauses the workflow and waits for multiple webhook callbacks before resuming. Each expected callback is defined by a query parameter and value pair. State is persisted in the database for crash safety.',
    defaults: {
      name: 'Multi Webhook Wait Node',
    },
    // Shows callback URL info in the n8n UI while the node is waiting
    waitingNodeTooltip: `={{ "Waiting for webhook callbacks at: <a href=\\"" + $execution.resumeUrl + "\\" target=\\"_blank\\">" + $execution.resumeUrl + "</a>" }}`,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
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
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'wait',
        options: [
          {
            name: 'Wait',
            value: 'wait',
            description: 'Register expected callbacks and pause the workflow until they all arrive (or it times out)',
          },
          {
            name: 'Clear',
            value: 'clear',
            description:
              'Report the current completion status for this execution and delete its DB entries. Use this downstream of a Wait node’s timeout branch to get a partial-execution summary and clean up.',
          },
        ],
      },
      {
        displayName: 'Define Expected Calls Statically',
        name: 'useStaticExpectedCalls',
        type: 'boolean',
        default: true,
        displayOptions: {
          show: {
            operation: ['wait'],
          },
        },
        description:
          'Whether to define expected calls manually (one by one) or dynamically via a JSON expression from a previous node',
      },
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
        displayOptions: {
          show: {
            operation: ['wait'],
            useStaticExpectedCalls: [true],
          },
        },
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
        displayName: 'Expected Calls (Dynamic)',
        name: 'expectedCallsDynamic',
        type: 'json',
        default:
          '=[{"queryParam": "actor", "queryValue": "reviewer1"}, {"queryParam": "actor", "queryValue": "reviewer2"}]',
        required: true,
        displayOptions: {
          show: {
            operation: ['wait'],
            useStaticExpectedCalls: [false],
          },
        },
        hint: 'Use an expression like ={{ $json.approvers.map(a => ({queryParam: "actor", queryValue: a})) }} to generate dynamically from a previous node.',
        description:
          'A JSON array where each object has "queryParam" (the URL parameter name) and "queryValue" (the unique identifier for that callback). One callback URL is generated per entry. Supports expressions.',
        placeholder:
          'e.g. [{"queryParam": "actor", "queryValue": "alice"}, {"queryParam": "actor", "queryValue": "bob"}]',
      },
      {
        displayName: 'Limit Wait Time',
        name: 'limitWaitTime',
        type: 'boolean',
        default: false,
        displayOptions: {
          show: {
            operation: ['wait'],
          },
        },
        description:
          'Whether to set a maximum time to wait before the execution resumes automatically with current status',
      },
      {
        displayName: 'Amount',
        name: 'timeoutAmount',
        type: 'number',
        default: 1,
        typeOptions: {
          minValue: 0,
          numberPrecision: 2,
        },
        displayOptions: {
          show: {
            limitWaitTime: [true],
          },
        },
        description: 'The time to wait before resuming',
      },
      {
        displayName: 'Unit',
        name: 'timeoutUnit',
        type: 'options',
        default: 'hours',
        options: [
          { name: 'Days', value: 'days' },
          { name: 'Hours', value: 'hours' },
          { name: 'Minutes', value: 'minutes' },
          { name: 'Seconds', value: 'seconds' },
        ],
        displayOptions: {
          show: {
            limitWaitTime: [true],
          },
        },
        description: 'The time unit of the wait amount',
      },
      {
        displayName: 'Notify External System About Callback URLs',
        name: 'enableNotify',
        type: 'boolean',
        default: false,
        displayOptions: {
          show: {
            operation: ['wait'],
          },
        },
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
    // Resolve credentials and internal token
    const { baseUrl, internalToken } = await resolveConfig(this);
    const executionId = this.evaluateExpression('{{ $execution.id }}', 0) as string;
    const operation = this.getNodeParameter('operation', 0, 'wait') as string;

    if (operation === 'clear') {
      return [
        this.helpers.returnJsonArray(
          await clearMultiWebhookWaitForExecution(this, { baseUrl, internalToken, executionId }),
        ),
      ];
    }

    // First call — register expected calls and put to wait
    const useStatic = this.getNodeParameter('useStaticExpectedCalls', 0, true) as boolean;
    const expectedCalls = resolveExpectedCalls(this, useStatic);
    const limitWaitTime = this.getNodeParameter('limitWaitTime', 0, false) as boolean;
    const enableNotify = this.getNodeParameter('enableNotify', 0, false) as boolean;

    if (expectedCalls.length < 1) {
      throw new NodeOperationError(this.getNode(), 'At least one expected call must be defined');
    }

    const resumeUrl = this.evaluateExpression('{{ $execution.resumeUrl }}', 0) as string;

    // Build match keys and callback URLs
    // Callback URLs point directly to the n8n webhook-waiting URL with identifying query params
    const matchKeys = expectedCalls.map((call) => ({
      matchKey: `${call.queryParam}=${call.queryValue}`,
    }));

    const callbackUrls: string[] = expectedCalls.map((call) => {
      const separator = resumeUrl.includes('?') ? '&' : '?';
      return `${resumeUrl}${separator}${encodeURIComponent(call.queryParam)}=${encodeURIComponent(call.queryValue)}`;
    });

    // Register expected calls with the external-hooks service
    await registerMultiWebhookWait(this, {
      baseUrl,
      internalToken,
      executionId,
      resumeUrl,
      matchKeys,
    });

    // Optionally notify an external system with the callback URLs
    if (enableNotify) {
      const notifyUrl = this.getNodeParameter('notifyUrl', 0, '') as string;
      const additionalData = this.getNodeParameter('additionalData', 0, '{}') as string;

      let extraData: object;
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
      let waitSeconds = this.getNodeParameter('timeoutAmount', 0, 1) as number;
      const unit = this.getNodeParameter('timeoutUnit', 0, 'hours') as string;

      if (unit === 'minutes') waitSeconds *= 60;
      else if (unit === 'hours') waitSeconds *= 60 * 60;
      else if (unit === 'days') waitSeconds *= 60 * 60 * 24;

      waitTill = new Date(Date.now() + waitSeconds * 1000);
    }
    await this.putExecutionToWait(waitTill);

    // This return value is only used on timeout resume (webhook completion replaces it).
    // n8n replays this cached output at the moment the wait timer fires rather than
    // re-running node code, so it can only ever reflect state as of wait *start* (always
    // 0 received) — never callbacks that arrived during the wait. Route the timeout branch
    // to a downstream node with Operation: Clear to get an accurate partial-completion report.
    const timeoutOutput: IDataObject = {
      status: 'timeout',
      message: `Wait timed out. 0/${expectedCalls.length} callbacks received at time of wait start. Use a downstream Clear-operation node for the actual partial status.`,
      expected: expectedCalls.length,
      received: 0,
      pending: matchKeys.map((k) => k.matchKey),
      completedCallbacks: [],
    };

    return [this.helpers.returnJsonArray(timeoutOutput)];
  }

  /**
   * Webhook handler — called each time an external caller hits the webhook-waiting URL.
   *
   * Flow:
   * 1. Extracts the identifying query param/value from the request.
   * 2. Calls the external-hooks service to mark this callback as received.
   * 3. If all expected callbacks received → returns workflowData (resumes execution).
   * 4. If not all received → returns webhookResponse (keeps waiting via restartWebhook).
   */
  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const query = this.getQueryData() as Record<string, unknown>;
    const body = this.getBodyData();
    const useStatic = this.getNodeParameter('useStaticExpectedCalls', true) as boolean;
    const expectedCalls = resolveExpectedCallsWebhook(this, useStatic);

    // Find which expected call matches this incoming request's query params
    const matchKey = findMatchingCall(query, expectedCalls);

    if (!matchKey) {
      return {
        webhookResponse: {
          status: 'rejected',
          message: 'No matching expected call found for the provided query parameters.',
          query,
        },
      };
    }

    // Resolve base URL and internal token from environment
    const baseUrl = (process.env.N8N_BASE_URL ?? process.env.WEBHOOK_URL ?? '').replace(/\/$/, '');
    const internalToken = process.env.INTERNAL_AUTH_TOKEN;

    if (!baseUrl || !internalToken) {
      throw new NodeOperationError(this.getNode(), 'Missing N8N_BASE_URL or INTERNAL_AUTH_TOKEN environment variable');
    }

    // Get execution ID from the request URL
    const req = this.getRequestObject();
    const executionId = extractExecutionId(req.originalUrl);

    // Call the external-hooks service to mark this callback as received
    const result = await markCallReceived(this, {
      baseUrl,
      internalToken,
      executionId,
      matchKey,
      payload: { body, query, receivedAt: new Date().toISOString() },
    });

    if (!result.allReceived) {
      // Not all callbacks received yet — respond and keep waiting
      return {
        webhookResponse: {
          status: 'accepted',
          message: `Callback received (${matchKey}). Waiting for ${result.totalExpected - result.totalReceived} more.`,
          received: result.totalReceived,
          expected: result.totalExpected,
          pending: result.pending,
        },
      };
    }

    // All callbacks received — resume the workflow with aggregated data.
    // With responseData='' and responseMode='onReceived', n8n uses webhookResponse
    // as the HTTP reply when workflowData is present.
    const output: IDataObject = {
      status: 'complete',
      message: `All callbacks received (${result.totalReceived}/${result.totalExpected}). Execution resumed.`,
      expected: result.totalExpected,
      received: result.totalReceived,
      calls: result.calls ?? {},
    };

    return {
      webhookResponse: output,
      workflowData: [this.helpers.returnJsonArray(output)],
    };
  }
}

/**
 * Resolves the base URL and internal auth token from environment variables.
 * The base URL is derived from the n8n instance (same host as the resume URL).
 */
async function resolveConfig(context: IExecuteFunctions): Promise<{ baseUrl: string; internalToken: string }> {
  // Derive base URL from N8N_BASE_URL env var or from the webhook URL
  const baseUrl = (process.env.N8N_BASE_URL ?? process.env.WEBHOOK_URL ?? '').replace(/\/$/, '');

  if (!baseUrl) {
    throw new NodeOperationError(context.getNode(), 'Cannot determine n8n base URL', {
      description:
        'The N8N_BASE_URL or WEBHOOK_URL environment variable must be set so the node can reach the external-hooks service.',
    });
  }

  const internalToken = process.env.INTERNAL_AUTH_TOKEN;
  if (!internalToken) {
    throw new NodeOperationError(context.getNode(), 'INTERNAL_AUTH_TOKEN is not configured', {
      description:
        'The n8n runtime must expose INTERNAL_AUTH_TOKEN so the Multi Webhook Wait node can authenticate to the external-hooks service.',
    });
  }

  return { baseUrl, internalToken };
}

/**
 * Registers the multi-webhook wait with the external-hooks service.
 */
async function registerMultiWebhookWait(
  context: IExecuteFunctions,
  params: {
    baseUrl: string;
    internalToken: string;
    executionId: string;
    resumeUrl: string;
    matchKeys: Array<{ matchKey: string }>;
  },
): Promise<void> {
  const { baseUrl, internalToken, executionId, resumeUrl, matchKeys } = params;
  const url = `${baseUrl}${REGISTER_PATH}`;

  try {
    await context.helpers.httpRequest({
      method: 'POST',
      url,
      headers: {
        Authorization: `Bearer ${internalToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: {
        executionId,
        resumeUrl,
        expectedCalls: matchKeys,
      },
      json: true,
    });
  } catch (error) {
    const detail = (error as Error)?.message ?? 'unknown error';
    throw new NodeOperationError(context.getNode(), `Failed to register multi-webhook wait: ${detail}`, {
      description: `POST ${url} failed. Ensure the external-hooks service is reachable and INTERNAL_AUTH_TOKEN matches.`,
    });
  }
}

interface MultiWebhookWaitStatus {
  totalExpected: number;
  totalReceived: number;
  allReceived: boolean;
  pending: string[];
  received: string[];
  receivedCalls: Record<string, unknown>;
}

/**
 * Clear operation — fetches the current completion status for an execution's multi-webhook
 * wait, deletes its DB entries, and returns a partial-execution summary (how many callbacks
 * completed vs. are still pending). Intended for use downstream of a Wait node's timeout branch.
 */
async function clearMultiWebhookWaitForExecution(
  context: IExecuteFunctions,
  params: { baseUrl: string; internalToken: string; executionId: string },
): Promise<IDataObject> {
  const { baseUrl, internalToken, executionId } = params;

  const status = await getMultiWebhookWaitStatus(context, { baseUrl, internalToken, executionId });

  if (!status) {
    return {
      status: 'not_found',
      message: `No multi-webhook wait entries found for execution ${executionId}.`,
      expected: 0,
      completed: 0,
      pending: 0,
      completedCallbacks: [],
      pendingCallbacks: [],
      calls: {},
    };
  }

  await cleanupMultiWebhookWait(context, { baseUrl, internalToken, executionId });

  return {
    status: status.allReceived ? 'complete' : 'partial',
    message: `Cleared multi-webhook wait state for execution ${executionId}. ${status.totalReceived}/${status.totalExpected} callbacks were received.`,
    expected: status.totalExpected,
    completed: status.totalReceived,
    pending: status.totalExpected - status.totalReceived,
    completedCallbacks: status.received,
    pendingCallbacks: status.pending,
    calls: status.receivedCalls,
  };
}

/**
 * Fetches the current completion status for an execution's multi-webhook wait.
 * Returns null if no wait is registered for the execution.
 */
async function getMultiWebhookWaitStatus(
  context: IExecuteFunctions,
  params: { baseUrl: string; internalToken: string; executionId: string },
): Promise<MultiWebhookWaitStatus | null> {
  const { baseUrl, internalToken, executionId } = params;
  const url = `${baseUrl}${STATUS_PATH_PREFIX}/${encodeURIComponent(executionId)}`;

  try {
    const response = await context.helpers.httpRequest({
      method: 'GET',
      url,
      headers: {
        Authorization: `Bearer ${internalToken}`,
        Accept: 'application/json',
      },
      json: true,
      returnFullResponse: true,
      ignoreHttpStatusErrors: true,
    });

    if (response.statusCode === 404) {
      return null;
    }

    const responseBody = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    return responseBody;
  } catch (error) {
    const detail = (error as Error)?.message ?? 'unknown error';
    throw new NodeOperationError(context.getNode(), `Failed to fetch multi-webhook wait status: ${detail}`, {
      description: `GET ${url} failed.`,
    });
  }
}

/**
 * Deletes the DB entries for an execution's multi-webhook wait.
 */
async function cleanupMultiWebhookWait(
  context: IExecuteFunctions,
  params: { baseUrl: string; internalToken: string; executionId: string },
): Promise<void> {
  const { baseUrl, internalToken, executionId } = params;
  const url = `${baseUrl}${CLEANUP_PATH_PREFIX}/${encodeURIComponent(executionId)}`;

  try {
    await context.helpers.httpRequest({
      method: 'DELETE',
      url,
      headers: {
        Authorization: `Bearer ${internalToken}`,
        Accept: 'application/json',
      },
      json: true,
    });
  } catch (error) {
    const detail = (error as Error)?.message ?? 'unknown error';
    throw new NodeOperationError(context.getNode(), `Failed to clean up multi-webhook wait: ${detail}`, {
      description: `DELETE ${url} failed.`,
    });
  }
}

/**
 * Marks a callback as received via the external-hooks service and returns completion status.
 */
async function markCallReceived(
  context: IWebhookFunctions,
  params: {
    baseUrl: string;
    internalToken: string;
    executionId: string;
    matchKey: string;
    payload: unknown;
  },
): Promise<{
  allReceived: boolean;
  totalReceived: number;
  totalExpected: number;
  pending: string[];
  calls: Record<string, unknown> | null;
}> {
  const { baseUrl, internalToken, executionId, matchKey, payload } = params;
  const url = `${baseUrl}${CALLBACK_PATH_PREFIX}/${encodeURIComponent(executionId)}`;

  try {
    const response = await context.helpers.httpRequest({
      method: 'POST',
      url,
      headers: {
        Authorization: `Bearer ${internalToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: { matchKey, payload },
      json: true,
      returnFullResponse: true,
    });

    const responseBody = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
    return responseBody;
  } catch (error) {
    const detail = (error as Error)?.message ?? 'unknown error';
    throw new NodeOperationError(context.getNode(), `Failed to mark callback as received: ${detail}`, {
      description: `POST ${url} failed.`,
    });
  }
}

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

/**
 * Resolves expected calls from either static (fixedCollection) or dynamic (JSON) mode.
 * Used in the execute() context (IExecuteFunctions).
 */
function resolveExpectedCalls(context: IExecuteFunctions, useStatic: boolean): ExpectedCall[] {
  if (useStatic) {
    const raw = context.getNodeParameter('expectedCalls', 0) as IDataObject;
    return (raw.calls as ExpectedCall[]) || [];
  }

  const dynamicRaw = context.getNodeParameter('expectedCallsDynamic', 0, '[]') as string | unknown[];
  let parsed: unknown[];
  try {
    parsed = typeof dynamicRaw === 'string' ? JSON.parse(dynamicRaw) : dynamicRaw;
  } catch {
    throw new NodeOperationError(
      context.getNode(),
      'Invalid JSON in Expected Calls (Dynamic) field. Must be an array of {queryParam, queryValue} objects.',
    );
  }

  if (!Array.isArray(parsed)) {
    throw new NodeOperationError(context.getNode(), 'Expected Calls (Dynamic) must be a JSON array.');
  }

  return parsed.map((item, index) => {
    const obj = item as Record<string, unknown>;
    if (!obj.queryParam || !obj.queryValue) {
      throw new NodeOperationError(
        context.getNode(),
        `Expected call at index ${index} is missing "queryParam" or "queryValue".`,
      );
    }
    return { queryParam: String(obj.queryParam), queryValue: String(obj.queryValue) };
  });
}

/**
 * Resolves expected calls from either static or dynamic mode.
 * Used in the webhook() context (IWebhookFunctions).
 */
function resolveExpectedCallsWebhook(context: IWebhookFunctions, useStatic: boolean): ExpectedCall[] {
  if (useStatic) {
    const raw = context.getNodeParameter('expectedCalls') as IDataObject;
    return (raw.calls as ExpectedCall[]) || [];
  }

  const dynamicRaw = context.getNodeParameter('expectedCallsDynamic', '[]') as string | unknown[];
  let parsed: unknown[];
  try {
    parsed = typeof dynamicRaw === 'string' ? JSON.parse(dynamicRaw) : dynamicRaw;
  } catch {
    throw new NodeOperationError(context.getNode(), 'Invalid JSON in Expected Calls (Dynamic) field.');
  }

  if (!Array.isArray(parsed)) {
    throw new NodeOperationError(context.getNode(), 'Expected Calls (Dynamic) must be a JSON array.');
  }

  return parsed.map((item) => {
    const obj = item as Record<string, unknown>;
    return { queryParam: String(obj.queryParam ?? ''), queryValue: String(obj.queryValue ?? '') };
  });
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
