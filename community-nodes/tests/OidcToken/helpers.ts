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

import { OidcToken } from '../../nodes/OidcToken/OidcToken.node';

const ISSUER = 'https://login.example.com/realms/test';
const TOKEN_ENDPOINT = `${ISSUER}/protocol/openid-connect/token`;

export const MOCK_CREDENTIALS = {
  oidcIssuer: '',
  oidcTokenEndpoint: '',
  oidcJwksUri: '',
  oidcClientId: 'test-client',
  oidcClientSecret: 'test-secret', // pragma: allowlist secret
  oidcUsername: '',
  oidcPassword: '',
};

export function cloneCreds(overrides: Record<string, unknown> = {}): typeof MOCK_CREDENTIALS {
  return { ...MOCK_CREDENTIALS, ...overrides };
}

/** Credentials configured to use the explicit token endpoint (no discovery). */
export function directCreds(overrides: Record<string, unknown> = {}): typeof MOCK_CREDENTIALS {
  return cloneCreds({ oidcTokenEndpoint: TOKEN_ENDPOINT, ...overrides });
}

/** Credentials configured for the Password grant (username + password set). */
export function passwordCreds(overrides: Record<string, unknown> = {}): typeof MOCK_CREDENTIALS {
  return directCreds({ oidcUsername: 'alice@example.com', oidcPassword: 's3cret-pw', ...overrides }); // pragma: allowlist secret
}

export interface RequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  qs?: Record<string, unknown>;
  json?: boolean;
}

export interface CreateContextOptions {
  credentials?: Record<string, unknown>;
  params?: Record<string, unknown>;
  /** single response → every httpRequest call returns it */
  httpResponse?: unknown;
  /** array of responses, returned in order across successive calls */
  httpResponses?: unknown[];
  /** map from url substring → response, so different endpoints return different bodies */
  httpResponseByUrl?: Record<string, unknown>;
  continueOnFail?: boolean;
}

export function createExecutionContext(opts: CreateContextOptions) {
  const {
    credentials = MOCK_CREDENTIALS,
    params = {},
    httpResponse = {},
    httpResponses,
    httpResponseByUrl,
    continueOnFail = false,
  } = opts;

  const callQueue = httpResponses ? [...httpResponses] : [];

  const httpRequest = vi.fn().mockImplementation((options: RequestOptions) => {
    if (httpResponseByUrl) {
      for (const [key, value] of Object.entries(httpResponseByUrl)) {
        if (options.url.includes(key)) return Promise.resolve(value);
      }
    }
    if (httpResponses && callQueue.length > 0) {
      return Promise.resolve(callQueue.shift());
    }
    return Promise.resolve(httpResponse);
  }) as ReturnType<typeof vi.fn> & {
    mockRejectedValueOnce: (e: unknown) => void;
  };

  const allParams: Record<string, unknown> = { grantType: 'client_credentials', processingMode: 'none', ...params };

  const ctx = {
    getInputData: vi.fn(() => [{ json: {} }]),
    getCredentials: vi.fn().mockResolvedValue(credentials),
    getNodeParameter: vi.fn((name: string, _index: number, fallback?: unknown) => {
      if (name in allParams) return allParams[name];
      return fallback;
    }),
    getNode: vi.fn(() => ({ name: 'OidcToken Test' })),
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
  return ctx;
}

export type TestExecutionContext = ReturnType<typeof createExecutionContext>;

export async function executeWith(opts: CreateContextOptions) {
  const node = new OidcToken();
  const ctx = createExecutionContext(opts);
  const result = await node.execute.call(ctx as never);
  return { ctx, result, httpRequest: ctx.helpers.httpRequest };
}

export function allRequestUrls(httpRequest: ReturnType<typeof vi.fn>): string[] {
  return httpRequest.mock.calls.map((c) => (c[0] as RequestOptions).url);
}

export function requestAt(httpRequest: ReturnType<typeof vi.fn>, n: number): RequestOptions {
  return httpRequest.mock.calls[n][0] as RequestOptions;
}
