import { describe, expect, it, vi } from 'vitest';
import { NodeOperationError } from 'n8n-workflow';
import { Wait } from 'n8n-nodes-base/dist/nodes/Wait/Wait.node';
import { CHEFSResubmit } from '../../nodes/CHEFSResubmit/CHEFSResubmit.node';

// Reuse a single instance; description is constructed once at instantiation.
const node = new CHEFSResubmit();
const desc = node.description;
const propNames = desc.properties.map((p) => p.name);

function findProp(name: string) {
  const p = desc.properties.find((p) => p.name === name);
  if (!p) throw new Error(`property ${name} not found`);
  return p;
}

describe('CHEFSResubmit node description', () => {
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
});

describe('CHEFSResubmit.execute pre-wait hook', () => {
  const SENTINEL = [['PRE_WAIT_SENTINEL']];

  function makeExecuteContext() {
    return {
      getInputData: vi.fn(() => [{ json: { hello: 'world' } }]),
      getNodeParameter: vi.fn((name: string) => {
        if (name === 'formId') return 'form-xyz';
        if (name === 'submissionId') return 'sub-42';
        if (name === 'resume') return 'webhook';
        return undefined;
      }),
      evaluateExpression: vi.fn(() => 'https://resume.example/webhook'),
      getNode: vi.fn(() => ({ name: 'CHEFS Resubmit' })),
      setMetadata: vi.fn(),
    };
  }

  it('reads previous-node output, formId, submissionId and resumeUrl, then delegates to parent Wait.execute', async () => {
    const ctx = makeExecuteContext();
    const parentSpy = vi.spyOn(Wait.prototype, 'execute').mockResolvedValue(SENTINEL as never);

    const result = await node.execute.call(node, ctx as never);

    // Pre-hook inspected previous-node output.
    expect(ctx.getInputData).toHaveBeenCalled();
    // Pre-hook read CHEFS identifiers.
    expect(ctx.getNodeParameter).toHaveBeenCalledWith('formId', 0);
    expect(ctx.getNodeParameter).toHaveBeenCalledWith('submissionId', 0);
    // Pre-hook computed the resume URL.
    expect(ctx.evaluateExpression).toHaveBeenCalledWith('{{ $execution.resumeUrl }}', 0);
    // Parent Wait.execute was delegated to.
    expect(parentSpy).toHaveBeenCalledTimes(1);
    // The placeholder returns the parent's result verbatim.
    expect(result).toBe(SENTINEL);
  });
});

describe('CHEFSResubmit.webhook post-resume hook', () => {
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
      getNode: vi.fn(() => ({ name: 'CHEFS Resubmit' })),
      getNodeParameter: vi.fn(() => 'webhook'),
    };
  }

  it('throws NodeOperationError when body, query, and params are all empty', async () => {
    const ctx = makeWebhookContext({ body: {}, query: {}, params: {} });
    const parentSpy = vi.spyOn(Wait.prototype, 'webhook');

    await expect(node.webhook.call(node, ctx as never)).rejects.toThrow(
      /CHEFS Resubmit webhook received no request data/,
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
