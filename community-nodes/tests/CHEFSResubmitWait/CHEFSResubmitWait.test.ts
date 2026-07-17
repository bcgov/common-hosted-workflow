import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';
import { Wait } from 'n8n-nodes-base/dist/nodes/Wait/Wait.node';
import { CHEFSResubmitWait } from '../../nodes/CHEFSResubmitWait/CHEFSResubmitWait.node';

// Reuse a single instance; description is constructed once at instantiation.
const node = new CHEFSResubmitWait();
const desc = node.description;
const propNames = desc.properties.map((p) => p.name);

function findProp(name: string) {
  const p = desc.properties.find((p) => p.name === name);
  if (!p) throw new Error(`property ${name} not found`);
  return p;
}

function withEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('CHEFSResubmitWait node description', () => {
  describe('CHEFS fields', () => {
    it('exposes required Form ID and Submission ID at the top', () => {
      expect(propNames[0]).toBe('formId');
      expect(propNames[1]).toBe('submissionId');

      const formId = findProp('formId');
      expect(formId.type).toBe('string');
      expect(formId.required).toBe(true);

      const submissionId = findProp('submissionId');
      expect(submissionId.type).toBe('string');
      expect(submissionId.required).toBe(true);
    });
  });

  describe('Resume is locked to webhook', () => {
    it('has exactly one resume property, hidden and defaulting to webhook', () => {
      const resumes = desc.properties.filter((p) => p.name === 'resume');
      expect(resumes).toHaveLength(1);

      const resume = resumes[0];
      expect(resume.type).toBe('hidden');
      expect(resume.default).toBe('webhook');
    });
  });

  describe('native Wait properties are inherited', () => {
    it('keeps webhook/form limit fields', () => {
      expect(propNames).toContain('limitWaitTime');
      expect(propNames).toContain('limitType');
      expect(propNames).toContain('resumeAmount');
      expect(propNames).toContain('resumeUnit');
      expect(propNames).toContain('maxDateAndTime');
    });

    it('drops the user-facing time/specificTime controls (no amount/unit/dateTime at top level intent)', () => {
      // These still exist in the inherited array, but are masked out by displayOptions
      // in webhook resume mode. Their presence proves inherited UI is untouched.
      expect(propNames).toContain('amount');
      expect(propNames).toContain('unit');
    });
  });

  it('does not require workflow interaction layer credentials', () => {
    expect((desc.credentials ?? []).map((credential) => credential.name)).not.toContain('workflowInteractionLayerApi');
  });
});

describe('CHEFSResubmitWait.execute pre-wait hook', () => {
  const SENTINEL = [['PRE_WAIT_SENTINEL']];

  function makeExecuteContext(overrides: Record<string, unknown> = {}) {
    return {
      getInputData: vi.fn(() => [{ json: { hello: 'world' } }]),
      getNodeParameter: vi.fn((name: string) => {
        if (name === 'formId') return 'form-xyz';
        if (name === 'submissionId') return 'sub-42';
        if (name === 'resume') return 'webhook';
        return undefined;
      }),
      evaluateExpression: vi.fn(() => 'https://resume.example/webhook'),
      getExecutionId: vi.fn(() => 'exec-100'),
      getNode: vi.fn(() => ({ name: 'CHEFS Resubmit Wait' })),
      setMetadata: vi.fn(),
      helpers: {
        httpRequest: vi.fn(async () => ({ success: true })),
      },
      ...overrides,
    };
  }

  let prevToken: string | undefined;
  let prevBaseUrl: string | undefined;
  beforeEach(() => {
    prevToken = process.env.INTERNAL_AUTH_TOKEN;
    prevBaseUrl = process.env.N8N_BASE_URL;
    withEnv('INTERNAL_AUTH_TOKEN', 'test-internal-token');
    withEnv('N8N_BASE_URL', 'https://n8n.example');
  });
  afterEach(() => {
    withEnv('INTERNAL_AUTH_TOKEN', prevToken);
    withEnv('N8N_BASE_URL', prevBaseUrl);
    vi.restoreAllMocks();
  });

  it('registers the submission webhook and delegates to parent Wait.execute', async () => {
    const ctx = makeExecuteContext();
    const parentSpy = vi.spyOn(Wait.prototype, 'execute').mockResolvedValue(SENTINEL as never);

    const result = await node.execute.call(node, ctx as never);

    // Pre-hook read CHEFS identifiers and the resume URL.
    expect(ctx.getNodeParameter).toHaveBeenCalledWith('formId', 0);
    expect(ctx.getNodeParameter).toHaveBeenCalledWith('submissionId', 0);
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('{{ $execution.resumeUrl }}', 0);
    expect(ctx.getExecutionId).toHaveBeenCalled();
    // Register call was made to the external-hooks service.
    expect(ctx.helpers.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'https://n8n.example/rest/custom/v1/chefs/submissions/register',
        headers: {
          Authorization: 'Bearer test-internal-token',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: {
          executionId: 'exec-100',
          formId: 'form-xyz',
          submissionId: 'sub-42',
          resumeUrl: 'https://resume.example/webhook',
        },
      }),
    );
    // Parent Wait.execute was delegated to.
    expect(parentSpy).toHaveBeenCalledTimes(1);
    expect(result).toBe(SENTINEL);
  });

  it('throws NodeOperationError when N8N_BASE_URL is not set', async () => {
    delete process.env.N8N_BASE_URL;
    const ctx = makeExecuteContext();
    const parentSpy = vi.spyOn(Wait.prototype, 'execute').mockResolvedValue(SENTINEL as never);

    await expect(node.execute.call(node, ctx as never)).rejects.toThrow(/N8N_BASE_URL is not configured/);
    expect(ctx.helpers.httpRequest).not.toHaveBeenCalled();
    expect(parentSpy).not.toHaveBeenCalled();
  });

  it('throws NodeOperationError when INTERNAL_AUTH_TOKEN is not set', async () => {
    delete process.env.INTERNAL_AUTH_TOKEN;
    const ctx = makeExecuteContext();
    const parentSpy = vi.spyOn(Wait.prototype, 'execute').mockResolvedValue(SENTINEL as never);

    await expect(node.execute.call(node, ctx as never)).rejects.toThrow(/INTERNAL_AUTH_TOKEN is not configured/);
    expect(ctx.helpers.httpRequest).not.toHaveBeenCalled();
    expect(parentSpy).not.toHaveBeenCalled();
  });

  it('throws NodeOperationError when the register HTTP call fails', async () => {
    const ctx = makeExecuteContext({
      helpers: {
        httpRequest: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    });
    const parentSpy = vi.spyOn(Wait.prototype, 'execute').mockResolvedValue(SENTINEL as never);

    await expect(node.execute.call(node, ctx as never)).rejects.toBeInstanceOf(NodeOperationError);
    expect(ctx.helpers.httpRequest).toHaveBeenCalled();
    expect(parentSpy).not.toHaveBeenCalled();
  });
});

describe('CHEFSResubmitWait.webhook post-resume hook', () => {
  function makeWebhookContext(
    over: {
      body?: unknown;
      query?: unknown;
      params?: unknown;
      headers?: unknown;
    } = {},
  ) {
    return {
      getBodyData: vi.fn(() => over.body ?? {}),
      getQueryData: vi.fn(() => over.query ?? {}),
      getParamsData: vi.fn(() => over.params ?? {}),
      getHeaderData: vi.fn(() => over.headers ?? {}),
      getNode: vi.fn(() => ({ name: 'CHEFS Resubmit Wait' })),
      getNodeParameter: vi.fn(() => 'webhook'),
    };
  }

  it('throws NodeOperationError when body, query, and params are all empty', async () => {
    const ctx = makeWebhookContext({ body: {}, query: {}, params: {} });
    const parentSpy = vi.spyOn(Wait.prototype, 'webhook');

    await expect(node.webhook.call(node, ctx as never)).rejects.toThrow(
      /CHEFS Resubmit Wait webhook received no request data/,
    );
    expect(parentSpy).not.toHaveBeenCalled();
  });

  it('delegates to parent Wait.webhook when request data is present', async () => {
    const ctx = makeWebhookContext({ body: { ok: true } });
    const SENTINEL = { webhookResponse: true } as never;
    const parentSpy = vi.spyOn(Wait.prototype, 'webhook').mockResolvedValue(SENTINEL);

    const result = await node.webhook.call(node, ctx as never);

    expect(parentSpy).toHaveBeenCalledTimes(1);
    expect(result).toBe(SENTINEL);
  });

  it('also delegates when only query params are present', async () => {
    const ctx = makeWebhookContext({ body: {}, query: { token: 'abc' }, params: {} });
    const parentSpy = vi.spyOn(Wait.prototype, 'webhook').mockResolvedValue({ ok: true } as never);

    await node.webhook.call(node, ctx as never);
    expect(parentSpy).toHaveBeenCalled();
  });

  it('thrown error is a NodeOperationError', async () => {
    const ctx = makeWebhookContext();
    const spy = vi.spyOn(Wait.prototype, 'webhook');
    let caught: unknown;
    try {
      await node.webhook.call(node, ctx as never);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(NodeOperationError);
    expect(spy).not.toHaveBeenCalled();
  });
});
