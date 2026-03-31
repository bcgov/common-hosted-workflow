import { vi } from 'vitest';

vi.mock('n8n-workflow', () => ({
  NodeConnectionTypes: { Main: 'main' },
  NodeApiError: class NodeApiError extends Error {
    constructor(_node: unknown, err: unknown) {
      super((err as Error)?.message ?? 'API error');
      this.name = 'NodeApiError';
    }
  },
  NodeOperationError: class NodeOperationError extends Error {
    constructor(_node: unknown, err: Error) {
      super(err.message);
      this.name = 'NodeOperationError';
    }
  },
}));

import { WorkflowInteractionLayer } from '../../nodes/WorkflowInteractionLayer/WorkflowInteractionLayer.node';

// ── Fixtures ──

export const MOCK_CREDENTIALS = {
  baseUrl: 'https://n8n.example.com',
  apiKey: 'test-api-key', // pragma: allowlist secret
  tenantId: 'tenant-uuid-123',
};

export const MOCK_WORKFLOW = { id: 'wf-42', name: 'Test Workflow' };
export const MOCK_EXECUTION_ID = 'exec-99';

export function makeMessageResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    title: 'Hello',
    body: 'World',
    actorId: 'user-1',
    actorType: 'user',
    workflowInstanceId: MOCK_EXECUTION_ID,
    workflowId: MOCK_WORKFLOW.id,
    status: 'active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    metadata: null,
    ...overrides,
  };
}

export function makeActionResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act-1',
    actionType: 'getapproval',
    payload: {},
    callbackUrl: 'https://example.com/callback',
    callbackMethod: 'POST',
    callbackPayloadSpec: null,
    actorId: 'user-1',
    actorType: 'user',
    workflowInstanceId: MOCK_EXECUTION_ID,
    workflowId: MOCK_WORKFLOW.id,
    status: 'pending',
    priority: 'normal',
    dueDate: null,
    checkIn: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    metadata: null,
    ...overrides,
  };
}

// ── Execution context builder ──

type ParamMap = Record<string, unknown>;

interface CreateContextOptions {
  resource: string;
  operation: string;
  params?: ParamMap;
  httpResponse?: unknown;
  /** Supply an array to have httpRequest return different values per call (for pagination). */
  httpResponses?: unknown[];
  continueOnFail?: boolean;
}

export function createExecutionContext(opts: CreateContextOptions) {
  const { resource, operation, params = {}, httpResponse = {}, httpResponses, continueOnFail = false } = opts;

  const httpRequest = httpResponses
    ? vi.fn().mockImplementation(() => {
        const next = httpResponses.shift();
        return Promise.resolve(next);
      })
    : vi.fn().mockResolvedValue(httpResponse);

  const allParams: ParamMap = { resource, operation, ...params };

  return {
    getInputData: vi.fn(() => [{ json: {} }]),
    getCredentials: vi.fn().mockResolvedValue(MOCK_CREDENTIALS),
    getNodeParameter: vi.fn((name: string, _index: number, fallback?: unknown) => {
      if (name in allParams) return allParams[name];
      return fallback;
    }),
    getWorkflow: vi.fn(() => MOCK_WORKFLOW),
    getExecutionId: vi.fn(() => MOCK_EXECUTION_ID),
    getNode: vi.fn(() => ({ name: 'WIL Test' })),
    continueOnFail: vi.fn(() => continueOnFail),
    helpers: {
      httpRequest,
      constructExecutionMetaData: vi.fn((items: unknown[], meta: { itemData: { item: number } }) =>
        (items as Array<{ json: unknown }>).map((item) => ({
          ...item,
          pairedItem: { item: meta.itemData.item },
        })),
      ),
      returnJsonArray: vi.fn((data: unknown) => (Array.isArray(data) ? data : [data]).map((d) => ({ json: d }))),
    },
  };
}

export async function executeWith(opts: CreateContextOptions) {
  const node = new WorkflowInteractionLayer();
  const ctx = createExecutionContext(opts);
  const result = await node.execute.call(ctx as never);
  return { ctx, result, httpRequest: ctx.helpers.httpRequest };
}

export function lastHttpBody(httpRequest: ReturnType<typeof vi.fn>) {
  return httpRequest.mock.calls[0]?.[0]?.body;
}

export function lastHttpQs(httpRequest: ReturnType<typeof vi.fn>) {
  return httpRequest.mock.calls[0]?.[0]?.qs;
}

export function lastHttpUrl(httpRequest: ReturnType<typeof vi.fn>) {
  return (httpRequest.mock.calls[0]?.[0]?.url as string) ?? '';
}
