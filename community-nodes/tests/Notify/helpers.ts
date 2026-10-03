import { vi } from 'vitest';
import {
  Expression,
  NodeHelpers,
  type IDataObject,
  type IExecuteSingleFunctions,
  type IHttpRequestOptions,
  type INode,
  type INodeParameters,
  type INodePropertyOptions,
  type IWorkflowDataProxyData,
} from 'n8n-workflow';
import { Notify } from '../../nodes/Notify/Notify.node';

export const description = new Notify().description;
export const baseUrl = 'https://notify-test.example.ca';
export const apiKey = 'Dummy-Notify-Key-SECRET-7'; // pragma: allowlist secret
const expression = new Expression('UTC');

function evaluate(value: string, data: IDataObject): unknown {
  return expression.resolveSimpleParameterValue(value, data as IWorkflowDataProxyData);
}

export function createHarness(
  parameters: Record<string, unknown> = {},
  credentialOverrides: Record<string, unknown> = {},
  item: IDataObject = {},
) {
  const values: Record<string, unknown> = {
    resource: 'service',
    operation: 'checkHealth',
    preview: false,
    payload: {
      email: {
        recipients: { to: ['citizen@example.com'] },
        content: { subject: 'Your permit application', body: 'Hello {{firstName}}' },
      },
      params: { firstName: 'Alice' },
    },
    emailPayload: '{}',
    smsPayload: '{}',
    notificationId: '',
    action: 'cancel',
    scheduledTime: '',
    page: 1,
    limit: 10,
    sort: '',
    filters: {},
    filter: {},
    templateId: '',
    name: '',
    channelCode: '',
    subject: '',
    body: '',
    engineCode: '',
    bodyType: '',
    description: '',
    params: '{}',
    callbackId: '',
    url: 'https://example.gov.bc.ca/hooks/notify',
    secret: '',
    headers: '{}',
    channelType: ['email'],
    trigger: ['success'],
    active: true,
    webhookType: '',
    ...parameters,
  };
  const credentials = { baseUrl, apiKey, ...credentialOverrides };
  const node: INode = {
    id: 'notify-test',
    name: 'Notify',
    type: 'community-nodes.notify',
    typeVersion: 1,
    position: [0, 0],
    parameters: values as INodeParameters,
  };
  // ExecuteSingleFunctions' second argument is the fallback, NOT an item index.
  // n8n checks missing raw parameters before evaluating per-item expressions.
  const getNodeParameter = vi.fn((name: string, fallback?: unknown): unknown => {
    const value = values[name] === undefined ? fallback : values[name];
    if (value === undefined) throw new Error(`Could not get parameter: ${name}`);
    return typeof value === 'string' && value.startsWith('=') ? evaluate(value, { $json: item }) : value;
  });
  const getCredentials = vi.fn(async () => credentials);
  const context = { getNode: () => node, getNodeParameter, getCredentials } as unknown as IExecuteSingleFunctions;
  const httpRequest = vi.fn(async (request: IHttpRequestOptions) => request);
  const visible = (name: string) =>
    description.properties.filter(
      (property) =>
        property.name === name && NodeHelpers.displayParameter(node.parameters, property, node, description),
    );

  async function send() {
    // Select routing using n8n's real visibility helper and evaluate its real URL
    // expression. Invoke the declared hooks before the mocked transport, as RoutingNode does.
    const selection = visible('operation');
    if (selection.length !== 1) throw new Error('Expected one visible operation selector');
    const option = (selection[0].options as INodePropertyOptions[]).find((entry) => entry.value === values.operation);
    if (!option?.routing?.request) throw new Error('Expected a declarative route');
    const resolvedParameters = new Proxy({}, { get: (_, name: string) => getNodeParameter(name) });
    const request = option.routing.request;
    // Resolve the credentials-expression baseURL to the mocked credential value,
    // mirroring runtime RoutingNode behaviour for '={{$credentials.notifyApi.baseUrl}}'.
    let baseURL = description.requestDefaults?.baseURL as string | undefined;
    if (typeof baseURL === 'string' && baseURL.startsWith('=')) {
      baseURL = credentials.baseUrl as string;
    }
    let options: IHttpRequestOptions = {
      ...description.requestDefaults,
      ...request,
      baseURL,
      headers: { ...description.requestDefaults?.headers },
      url: evaluate(String(request.url), { $parameter: resolvedParameters }) as string,
    } as IHttpRequestOptions;
    for (const preSend of option.routing.send?.preSend ?? []) {
      options = await preSend.call(context, options);
    }
    return await httpRequest(options);
  }

  return { context, node, getNodeParameter, getCredentials, httpRequest, visible, send };
}
