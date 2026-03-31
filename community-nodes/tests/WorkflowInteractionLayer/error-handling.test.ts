import { describe, expect, it } from 'vitest';
import { createExecutionContext, MOCK_CREDENTIALS } from './helpers';
import { WorkflowInteractionLayer } from '../../nodes/WorkflowInteractionLayer/WorkflowInteractionLayer.node';

describe('WorkflowInteractionLayer — Error handling', () => {
  it('returns error json when continueOnFail is true and request throws', async () => {
    const node = new WorkflowInteractionLayer();
    const ctx = createExecutionContext({
      resource: 'action',
      operation: 'get',
      params: { actionId: 'bad-id' },
      continueOnFail: true,
    });
    ctx.helpers.httpRequest.mockRejectedValueOnce(new Error('Not Found'));

    const result = await node.execute.call(ctx as never);

    expect(result[0][0].json).toEqual({ error: 'Not Found' });
    expect(result[0][0].pairedItem).toEqual({ item: 0 });
  });

  it('throws NodeApiError when request fails with a response property', async () => {
    const node = new WorkflowInteractionLayer();
    const ctx = createExecutionContext({
      resource: 'action',
      operation: 'get',
      params: { actionId: 'bad-id' },
    });
    const apiError = Object.assign(new Error('Forbidden'), { response: { status: 403 } });
    ctx.helpers.httpRequest.mockRejectedValueOnce(apiError);

    await expect(node.execute.call(ctx as never)).rejects.toThrow('Forbidden');
  });

  it('throws NodeOperationError for generic errors without response', async () => {
    const node = new WorkflowInteractionLayer();
    const ctx = createExecutionContext({
      resource: 'message',
      operation: 'create',
      params: {
        actorId: 'user-1',
        actorType: 'user',
        title: 'T',
        body: 'B',
        metadata: '{}',
      },
    });
    ctx.helpers.httpRequest.mockRejectedValueOnce(new TypeError('Network failure'));

    await expect(node.execute.call(ctx as never)).rejects.toThrow('Network failure');
  });

  it('builds correct auth headers from credentials', async () => {
    const node = new WorkflowInteractionLayer();
    const ctx = createExecutionContext({
      resource: 'action',
      operation: 'get',
      params: { actionId: 'act-1' },
      httpResponse: { id: 'act-1' },
    });

    await node.execute.call(ctx as never);

    const headers = ctx.helpers.httpRequest.mock.calls[0][0].headers;
    expect(headers['X-N8N-API-KEY']).toBe(MOCK_CREDENTIALS.apiKey);
    expect(headers['X-TENANT-ID']).toBe(MOCK_CREDENTIALS.tenantId);
    expect(headers.Authorization).toMatch(/^Bearer /);
  });
});
