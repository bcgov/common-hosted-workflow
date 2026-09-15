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
    constructor(_node: unknown, err: Error | string) {
      super(typeof err === 'string' ? err : err.message);
      this.name = 'NodeOperationError';
    }
  },
}));

import { KeyValueStore } from '../../nodes/KeyValueStore/KeyValueStore.node';

export const MOCK_CREDENTIALS = {
  pairs: {
    values: [
      { name: 'apiUrl', value: 'https://example.com' },
      { name: 'apiKey', value: 's3cret' }, // pragma: allowlist secret
    ],
  },
};

export function cloneCreds(overrides: Record<string, unknown> = {}): typeof MOCK_CREDENTIALS {
  return { ...MOCK_CREDENTIALS, ...overrides };
}

export interface CreateContextOptions {
  credentials?: Record<string, unknown>;
  params?: Record<string, unknown>;
  inputItems?: Array<{ json: Record<string, unknown> }>;
  continueOnFail?: boolean;
}

export function createExecutionContext(opts: CreateContextOptions) {
  const { credentials = MOCK_CREDENTIALS, params = {}, inputItems = [{ json: {} }], continueOnFail = false } = opts;

  const allParams: Record<string, unknown> = { outputFormat: 'both', ...params };

  const ctx = {
    getInputData: vi.fn(() => inputItems),
    getCredentials: vi.fn().mockResolvedValue(credentials),
    getNodeParameter: vi.fn((name: string, _index: number, fallback?: unknown) => {
      if (name in allParams) return allParams[name];
      return fallback;
    }),
    getNode: vi.fn(() => ({ name: 'KeyValueStore Test' })),
    continueOnFail: vi.fn(() => continueOnFail),
    helpers: {
      constructExecutionMetaData: vi.fn((items: unknown[], meta: { itemData: { item: number } }) =>
        (items as Array<{ json: unknown }>).map((item) => ({
          ...item,
          pairedItem: { item: meta.itemData.item },
        })),
      ),
      returnJsonArray: vi.fn((data: unknown) => (Array.isArray(data) ? data : [data]).map((d) => ({ json: d }))),
    },
  };
  return ctx;
}

export type TestExecutionContext = ReturnType<typeof createExecutionContext>;

export async function executeWith(opts: CreateContextOptions) {
  const node = new KeyValueStore();
  const ctx = createExecutionContext(opts);
  const result = await node.execute.call(ctx as never);
  return { ctx, result };
}
