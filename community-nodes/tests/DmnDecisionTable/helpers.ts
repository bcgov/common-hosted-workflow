import { vi } from 'vitest';

vi.mock('n8n-workflow', () => ({
  NodeConnectionTypes: { Main: 'main' },
  NodeOperationError: class NodeOperationError extends Error {
    constructor(_node: unknown, err: Error | string) {
      super(typeof err === 'string' ? err : err.message);
      this.name = 'NodeOperationError';
    }
  },
}));

import { DmnDecisionTable } from '../../nodes/DmnDecisionTable/DmnDecisionTable.node';

export interface CreateContextOptions {
  params?: Record<string, unknown>;
  inputItems?: Array<{ json: Record<string, unknown> }>;
  continueOnFail?: boolean;
}

export function createExecutionContext(opts: CreateContextOptions) {
  const { params = {}, inputItems = [{ json: {} }], continueOnFail = false } = opts;

  const ctx = {
    getInputData: vi.fn(() => inputItems),
    getNodeParameter: vi.fn((name: string, index: number, fallback?: unknown) => {
      if (name in params) {
        const value = params[name];
        // Function values resolve per item index (simulates expressions).
        if (typeof value === 'function') return (value as (itemIndex: number) => unknown)(index);
        return value;
      }
      return fallback;
    }),
    getNode: vi.fn(() => ({ name: 'DMN Decision Table Test' })),
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
  const node = new DmnDecisionTable();
  const ctx = createExecutionContext(opts);
  const result = await node.execute.call(ctx as never);
  return { ctx, result };
}

/** Converts a default-output object into Default Output Entries rows. */
export function defaultOutputEntries(obj: Record<string, unknown>) {
  return {
    definitions: Object.entries(obj).map(([outputName, value]) => ({ outputName, value: JSON.stringify(value) })),
  };
}

/** Params for a manual table mirroring the discount-band fixture. */
export function manualDiscountParams(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tableSource: 'manual',
    decisionId: 'discountBand',
    hitPolicy: 'FIRST',
    inputs: {
      definitions: [
        { name: 'spend', type: 'number' },
        { name: 'tier', type: 'string' },
      ],
    },
    outputs: {
      definitions: [
        { name: 'discount', type: 'number' },
        { name: 'label', type: 'string' },
      ],
    },
    rules: {
      entries: [
        {
          inputEntries: {
            values: [
              { inputName: 'spend', expression: '>=1000' },
              { inputName: 'tier', expression: '"gold"' },
            ],
          },
          outputEntries: {
            values: [
              { outputName: 'discount', value: '0.2' },
              { outputName: 'label', value: '"vip"' },
            ],
          },
        },
        {
          inputEntries: {
            values: [
              { inputName: 'spend', expression: '>=500' },
              { inputName: 'tier', expression: '' },
            ],
          },
          outputEntries: {
            values: [
              { outputName: 'discount', value: '0.1' },
              { outputName: 'label', value: '"standard"' },
            ],
          },
        },
      ],
    },
    defaultOutputs: defaultOutputEntries({ discount: 0, label: 'none' }),
    noMatchBehavior: 'default',
    outputMode: 'merge',
    resultKey: 'decision',
    ...overrides,
  };
}
