import { describe, expect, it, vi } from 'vitest';
import {
  executeWith,
  lastHttpBody,
  makeActionResponse,
  MOCK_EXECUTION_ID,
  MOCK_RESUME_URL,
  MOCK_WORKFLOW,
} from './helpers';
import { WorkflowInteractionLayer } from '../../nodes/WorkflowInteractionLayer/WorkflowInteractionLayer.node';

describe('WorkflowInteractionLayer — Action — createAndWait', () => {
  it('locks the callback to the resume URL and puts the execution to wait', async () => {
    const action = makeActionResponse({ id: 'act-wait-1' });
    const { ctx, result, httpRequest } = await executeWith({
      resource: 'action',
      operation: 'createAndWait',
      params: {
        actorId: 'user-1',
        actorType: 'user',
        actionType: 'showform',
        formName: 'Income Verification',
        formId: 'form-123',
        formApiKey: 'chefs-secret', // pragma: allowlist secret
        submissionId: '',
        formPreFillData: '{}',
        dueDate: '',
        priority: 'normal',
        checkIn: '',
        metadata: '{}',
        limitWaitTime: false,
      },
      httpResponse: action,
    });

    expect(httpRequest).toHaveBeenCalledOnce();
    expect(lastHttpBody(httpRequest)).toMatchObject({
      workflowInstanceId: MOCK_EXECUTION_ID,
      workflowId: MOCK_WORKFLOW.id,
      actorId: 'user-1',
      actionType: 'showform',
      callbackMethod: 'POST',
      callbackUrl: MOCK_RESUME_URL,
    });

    expect(ctx.putExecutionToWait).toHaveBeenCalledOnce();
    expect(result[0][0].json).toMatchObject({ status: 'timeout', actionId: 'act-wait-1' });

    const customData = ctx.getWorkflowDataProxy.mock.results[0].value.$execution.customData;
    expect(customData.set).toHaveBeenCalledWith('wilActionId', 'act-wait-1');
    expect(customData.set).toHaveBeenCalledWith('wilActionStatus', 'waiting');
  });

  it('computes a bounded waitTill when Limit Wait Time is enabled', async () => {
    const { ctx } = await executeWith({
      resource: 'action',
      operation: 'createAndWait',
      params: {
        actorId: 'user-1',
        actorType: 'user',
        actionType: 'waitonevent',
        payload: '{"eventName":"clicked"}',
        dueDate: '',
        priority: 'normal',
        checkIn: '',
        metadata: '{}',
        limitWaitTime: true,
        timeoutAmount: 2,
        timeoutUnit: 'hours',
      },
      httpResponse: makeActionResponse(),
    });

    const waitTill = (ctx.putExecutionToWait as ReturnType<typeof vi.fn>).mock.calls[0][0] as Date;
    const expectedMs = 2 * 60 * 60 * 1000;
    expect(waitTill.getTime() - Date.now()).toBeGreaterThan(expectedMs - 5000);
    expect(waitTill.getTime() - Date.now()).toBeLessThan(expectedMs + 5000);
  });

  it('resolves waitTill to Max Date and Time when Limit Type is "At Specified Time"', async () => {
    const { ctx } = await executeWith({
      resource: 'action',
      operation: 'createAndWait',
      params: {
        actorId: 'user-1',
        actorType: 'user',
        actionType: 'waitonevent',
        payload: '{"eventName":"clicked"}',
        dueDate: '',
        priority: 'normal',
        checkIn: '',
        metadata: '{}',
        limitWaitTime: true,
        limitType: 'atSpecifiedTime',
        maxDateAndTime: '2030-06-15T12:00:00.000Z',
      },
      httpResponse: makeActionResponse(),
    });

    const waitTill = (ctx.putExecutionToWait as ReturnType<typeof vi.fn>).mock.calls[0][0] as Date;
    expect(waitTill.toISOString()).toBe('2030-06-15T12:00:00.000Z');
  });

  it('throws when Limit Type is "At Specified Time" but Max Date and Time is empty', async () => {
    await expect(
      executeWith({
        resource: 'action',
        operation: 'createAndWait',
        params: {
          actorId: 'user-1',
          actorType: 'user',
          actionType: 'waitonevent',
          payload: '{"eventName":"clicked"}',
          dueDate: '',
          priority: 'normal',
          checkIn: '',
          metadata: '{}',
          limitWaitTime: true,
          limitType: 'atSpecifiedTime',
          maxDateAndTime: '',
        },
        httpResponse: makeActionResponse(),
      }),
    ).rejects.toThrow('Max Date and Time is required');
  });

  it('sends skipChefsSubmission and selected-field mappings through to the payload', async () => {
    const { httpRequest } = await executeWith({
      resource: 'action',
      operation: 'createAndWait',
      params: {
        actorId: 'user-1',
        actorType: 'user',
        actionType: 'showform',
        formName: 'Income Verification',
        formId: 'form-123',
        formApiKey: 'chefs-secret', // pragma: allowlist secret
        submissionId: '',
        formPreFillData: '{}',
        skipChefsSubmission: true,
        callbackDataMode: 'selected',
        callbackFieldMappingMode: 'keyValue',
        callbackFieldMappings: { mapping: [{ outputKey: 'firstName', sourcePath: 'firstName' }] },
        callbackMissingPathBehavior: 'returnNull',
        dueDate: '',
        priority: 'normal',
        checkIn: '',
        metadata: '{}',
        limitWaitTime: false,
      },
      httpResponse: makeActionResponse(),
    });

    expect(lastHttpBody(httpRequest).payload).toMatchObject({
      skipChefsSubmission: true,
      callbackFieldMappings: [{ outputKey: 'firstName', sourcePath: 'firstName' }],
      callbackMissingPathBehavior: 'returnNull',
    });
  });

  describe('webhook (resume)', () => {
    it('resumes execution with the callback body as workflowData and marks customData completed', async () => {
      const node = new WorkflowInteractionLayer();
      const callbackBody = { formId: 'form-123', submission_id: 'sub-1' };
      const webhookCtx = {
        getBodyData: vi.fn(() => callbackBody),
        evaluateExpression: vi.fn(),
        helpers: {
          returnJsonArray: vi.fn((data: unknown) => (Array.isArray(data) ? data : [data]).map((d) => ({ json: d }))),
        },
      };

      const response = await node.webhook.call(webhookCtx as never);

      expect(response.workflowData?.[0][0].json).toEqual(callbackBody);
      expect(webhookCtx.evaluateExpression).toHaveBeenCalledWith(
        expect.stringContaining('$execution.customData.set("wilActionStatus", "completed")'),
      );
    });
  });
});
