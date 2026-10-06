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
import { CHEFS } from '../../nodes/CHEFS/CHEFS.node';

export const description = new CHEFS().description;
export const formID = '65024e16-034d-4519-b69e-64c847508212';
export const submissionID = 'd3dc5423-fac4-4f84-984f-b798c4165b55';
export const localToken = 'Local-Shared-Secret-Ä9';
export const apiKey = 'Dummy-Upstream-Key-SECRET-7'; // pragma: allowlist secret
const expression = new Expression('UTC');

function evaluate(value: string, data: IDataObject): unknown {
  return expression.resolveSimpleParameterValue(value, data as IWorkflowDataProxyData);
}
export const operations = [
  { resource: 'submission', operation: 'get', path: `/submissions/${submissionID}`, needsSubmission: true },
  { resource: 'status', operation: 'getFormStatuses', path: `/forms/${formID}/statusCodes`, needsSubmission: false },
  {
    resource: 'status',
    operation: 'includeAuthorizationHeaderStatuses',
    path: `/submissions/${submissionID}/status`,
    needsSubmission: true,
  },
];

export function createHarness(
  parameters: Record<string, unknown> = {},
  credentialOverrides: Record<string, unknown> = {},
  item: IDataObject = {},
) {
  const values: Record<string, unknown> = {
    resource: 'submission',
    operation: 'get',
    formID,
    submissionID,
    authorizationToken: localToken,
    ...parameters,
  };
  const credentials = { authorizationToken: localToken, apiKey, ...credentialOverrides };
  const node: INode = {
    id: 'chefs-test',
    name: 'CHEFS',
    type: 'community-nodes.chefs',
    typeVersion: 1,
    position: [0, 0],
    parameters: values as INodeParameters,
  };
  // ExecuteSingleFunctions' second argument is the fallback, NOT an item index.
  // n8n checks missing raw parameters before evaluating per-item expressions.
  // These string properties have no validateType, so n8n does not coerce their values.
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
    let options: IHttpRequestOptions = {
      ...description.requestDefaults,
      ...request,
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
