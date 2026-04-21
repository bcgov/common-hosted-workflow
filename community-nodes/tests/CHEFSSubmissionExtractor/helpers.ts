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
    itemIndex?: number;
    constructor(_node: unknown, msg: string | Error, opts?: { itemIndex?: number }) {
      super(typeof msg === 'string' ? msg : msg.message);
      this.name = 'NodeOperationError';
      this.itemIndex = opts?.itemIndex;
    }
  },
}));

import { CHEFSSubmissionExtractor } from '../../nodes/CHEFSSubmissionExtractor/CHEFSSubmissionExtractor.node';
import type { ChefsSubmissionResponse } from '../../nodes/CHEFSSubmissionExtractor/shared/types';

// ── Fixtures ──

export const MOCK_API_KEY = 'test-chefs-api-key'; // pragma: allowlist secret

/** Single city-field mapping reused across many tests to avoid duplication */
export const CITY_MAPPING = {
  mapping: [{ outputKey: 'city', sourcePath: 'company.headquarters.address.city' }],
};

/**
 * Shared test data fixture for fieldExtractor unit tests.
 * Covers nested objects, arrays, falsy values, and edge cases.
 */
export function makeFieldExtractorTestData(): Record<string, unknown> {
  return {
    applicant: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: null,
    },
    company: {
      headquarters: {
        address: {
          city: 'Victoria',
          province: 'BC',
        },
      },
    },
    items: [
      { name: 'Widget', quantity: 5 },
      { name: 'Gadget', quantity: 3 },
    ],
    nested: {
      matrix: [
        [10, 20],
        [30, 40],
      ],
    },
    status: 'submitted',
    count: 42,
    active: true,
    emptyField: '',
    zeroField: 0,
    falseField: false,
  };
}

export function makeChefsSubmissionResponse(overrides: Record<string, unknown> = {}): ChefsSubmissionResponse {
  const inner = {
    id: 'sub-001',
    formVersionId: 'fv-001',
    confirmationId: 'CONF001',
    draft: false,
    deleted: false,
    submission: {
      data: {
        applicant: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: null,
        },
        company: {
          headquarters: {
            address: {
              city: 'Victoria',
              province: 'BC',
              postal: 'V8W 1A1',
            },
          },
          meta: {
            integrations: {
              salesforce: {
                accountId: 'SF-12345',
                syncDate: '2025-01-01',
              },
            },
          },
        },
        status: 'submitted',
        count: 42,
        active: true,
        emptyField: '',
      },
      state: 'submitted',
    },
    createdBy: 'gateway-user',
    createdAt: '2026-04-16T21:57:00.610Z',
    updatedBy: null,
    updatedAt: '2026-04-16T21:57:00.610Z',
    ...overrides,
  };

  return { submission: inner } as ChefsSubmissionResponse;
}

// ── Execution context builder ──

type ParamMap = Record<string, unknown>;

interface CreateContextOptions {
  submissionId?: string;
  formId?: string;
  apiKey?: string;
  baseUrl?: string;
  fieldMappingMode?: 'keyValue' | 'json';
  missingPathBehavior?: 'returnNull' | 'throwError';
  includeSubmissionMeta?: boolean;
  fieldMappings?: { mapping: Array<{ outputKey: string; sourcePath: string }> };
  fieldMappingJson?: string;
  httpResponse?: unknown;
  continueOnFail?: boolean;
}

export function createExecutionContext(opts: CreateContextOptions) {
  const {
    submissionId = 'sub-001',
    formId = 'form-001',
    apiKey = MOCK_API_KEY,
    baseUrl = 'https://submit.digital.gov.bc.ca/app/api/v1',
    fieldMappingMode = 'keyValue',
    missingPathBehavior = 'returnNull',
    includeSubmissionMeta = false,
    fieldMappings = { mapping: [] },
    fieldMappingJson = '{}',
    httpResponse = makeChefsSubmissionResponse(),
    continueOnFail = false,
  } = opts;

  const httpRequest = vi.fn().mockResolvedValue(httpResponse);

  const getCredentials = vi.fn().mockResolvedValue({
    formId,
    apiKey,
    baseUrl,
  });

  const allParams: ParamMap = {
    submissionId,
    formId,
    apiKey,
    baseUrl,
    fieldMappingMode,
    missingPathBehavior,
    includeSubmissionMeta,
    fieldMappings,
    fieldMappingJson,
  };

  return {
    getInputData: vi.fn(() => [{ json: {} }]),
    getNodeParameter: vi.fn((name: string, _index: number, fallback?: unknown) => {
      if (name in allParams) return allParams[name];
      return fallback;
    }),
    getCredentials: getCredentials,
    getNode: vi.fn(() => ({ name: 'CHEFS Submission Extractor Test' })),
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

// ── Convenience wrapper ──

export async function executeWith(opts: CreateContextOptions) {
  const node = new CHEFSSubmissionExtractor();
  const ctx = createExecutionContext(opts);
  const result = await node.execute.call(ctx as never);
  return { ctx, result, httpRequest: ctx.helpers.httpRequest };
}
