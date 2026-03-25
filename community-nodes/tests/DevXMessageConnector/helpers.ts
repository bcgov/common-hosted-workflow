import { afterEach, beforeEach, expect, vi } from 'vitest';

vi.mock('n8n-workflow', () => ({
  NodeConnectionTypes: {
    Main: 'main',
  },
}));

import { DevXMessageConnector } from '../../nodes/DevXMessageConnector/DevXMessageConnector.node';

export type NodeParameters = {
  type: 'template' | 'text' | 'html' | string;
  source?: string;
  payload: unknown;
};

type HttpRequestOptions = {
  url: string;
  headers: Record<string, string>;
  body: {
    target: {
      teamId: string;
      channelId: string;
    };
    content: unknown;
  };
};

type ExecutionContext = {
  getInputData: ReturnType<typeof vi.fn>;
  getCredentials: ReturnType<typeof vi.fn>;
  getNodeParameter: ReturnType<typeof vi.fn>;
  helpers: {
    httpRequest: ReturnType<typeof vi.fn>;
  };
};

const teamsChannelLink =
  'https://teams.microsoft.com/l/channel/19%3Achannel-id/General?groupId=group-123&tenantId=tenant-456';
const originalApiKey = process.env.DEVX_CONNECTOR_API_KEY;
const originalApiUrl = process.env.DEVX_CONNECTOR_API_URL;

export function setupDevXConnectorEnv() {
  beforeEach(() => {
    process.env.DEVX_CONNECTOR_API_KEY = 'test-api-key'; // pragma: allowlist secret
    process.env.DEVX_CONNECTOR_API_URL = 'https://devx.example/';
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.DEVX_CONNECTOR_API_KEY;
    } else {
      process.env.DEVX_CONNECTOR_API_KEY = originalApiKey;
    }

    if (originalApiUrl === undefined) {
      delete process.env.DEVX_CONNECTOR_API_URL;
    } else {
      process.env.DEVX_CONNECTOR_API_URL = originalApiUrl;
    }
  });
}

export function createExecutionContext(
  parametersByIndex: NodeParameters[],
  channelLink = teamsChannelLink,
): ExecutionContext {
  const httpRequest = vi.fn().mockResolvedValue({ ok: true });

  return {
    getInputData: vi.fn(() => parametersByIndex.map(() => ({ json: {} }))),
    getCredentials: vi.fn().mockResolvedValue({ channelLink }),
    getNodeParameter: vi.fn((name: keyof NodeParameters, index: number) => parametersByIndex[index]?.[name]),
    helpers: {
      httpRequest,
    },
  };
}

export async function executeNode(parametersByIndex: NodeParameters[], channelLink?: string) {
  const node = new DevXMessageConnector();
  const context = createExecutionContext(parametersByIndex, channelLink);
  const result = await node.execute.call(context as never);
  const requestOptionsList = context.helpers.httpRequest.mock.calls.map(([options]) => options as HttpRequestOptions);

  return {
    context,
    result,
    requestOptions: requestOptionsList[0],
    requestOptionsList,
  };
}

export function getSentContent(requestOptions: HttpRequestOptions) {
  return requestOptions.body.content;
}

export function expectPostedToDevX(requestOptions: HttpRequestOptions) {
  expect(requestOptions.url).toBe('https://devx.example/api/v1/messages');
  expect(requestOptions.headers.Authorization).toBe('Bearer test-api-key');
  expect(requestOptions.body.target).toEqual({
    teamId: 'group-123',
    channelId: '19:channel-id',
  });
}

export function createNode() {
  return new DevXMessageConnector();
}

export function suppressConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => undefined);
}
