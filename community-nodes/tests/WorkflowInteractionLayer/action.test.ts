import { describe, expect, it } from 'vitest';
import {
  executeWith,
  lastHttpBody,
  lastHttpUrl,
  lastHttpQs,
  makeActionResponse,
  MOCK_EXECUTION_ID,
  MOCK_WORKFLOW,
} from './helpers';
import { actionCreateProperties } from '../../nodes/WorkflowInteractionLayer/shared/properties';

describe('WorkflowInteractionLayer — Action', () => {
  describe('create', () => {
    it('sends a correctly shaped POST to /actions', async () => {
      const action = makeActionResponse();
      const { result, httpRequest } = await executeWith({
        resource: 'action',
        operation: 'create',
        params: {
          actorId: 'user-1',
          actorType: 'user',
          actionType: 'getapproval',
          callbackUrl: 'https://example.com/callback',
          callbackMethod: 'POST',
          approvalHtml: '<p>Approve?</p>',
          approvalOptions: { option: [{ label: 'Approve' }] },
          callbackPayloadSpec: '{}',
          dueDate: '',
          priority: 'normal',
          checkIn: '',
          metadata: '{}',
        },
        httpResponse: action,
      });

      expect(httpRequest).toHaveBeenCalledOnce();
      expect(lastHttpUrl(httpRequest)).toContain('/actions');
      expect(lastHttpBody(httpRequest)).toMatchObject({
        workflowInstanceId: MOCK_EXECUTION_ID,
        workflowId: MOCK_WORKFLOW.id,
        actorId: 'user-1',
        actorType: 'user',
        actionType: 'getapproval',
        callbackUrl: 'https://example.com/callback',
        callbackMethod: 'POST',
        priority: 'normal',
      });
      expect(result[0][0].json).toEqual(action);
    });

    it('includes optional fields when provided', async () => {
      await executeWith({
        resource: 'action',
        operation: 'create',
        params: {
          actorId: 'user-1',
          actorType: 'user',
          actionType: 'getapproval',
          callbackUrl: 'https://example.com/cb',
          callbackMethod: 'PUT',
          approvalHtml: '<p>Approve?</p>',
          approvalOptions: { option: [{ label: 'Yes' }] },
          callbackPayloadSpec: '{"key":"val"}',
          dueDate: '2025-12-31T00:00:00Z',
          priority: 'critical',
          checkIn: '2025-12-15T00:00:00Z',
          metadata: '{"env":"prod"}',
        },
        httpResponse: makeActionResponse(),
      }).then(({ httpRequest }) => {
        const body = lastHttpBody(httpRequest);
        expect(body.payload).toEqual({ html: '<p>Approve?</p>', options: ['Yes'] });
        expect(body.callbackPayloadSpec).toEqual({ key: 'val' });
        expect(body.dueDate).toBe('2025-12-31T00:00:00Z');
        expect(body.priority).toBe('critical');
        expect(body.checkIn).toBe('2025-12-15T00:00:00Z');
        expect(body.metadata).toEqual({ env: 'prod' });
      });
    });

    it('sends actionTitle as a top-level field when provided', async () => {
      const { httpRequest } = await executeWith({
        resource: 'action',
        operation: 'create',
        params: {
          actorId: 'user-1',
          actorType: 'user',
          actionType: 'getapproval',
          actionTitle: 'Review Purchase Order',
          callbackUrl: 'https://example.com/callback',
          callbackMethod: 'POST',
          approvalHtml: '<p>Approve?</p>',
          approvalOptions: { option: [{ label: 'Approve' }] },
          callbackPayloadSpec: '{}',
          dueDate: '',
          priority: 'normal',
          checkIn: '',
          metadata: '{}',
        },
        httpResponse: makeActionResponse(),
      });

      expect(lastHttpBody(httpRequest)).toMatchObject({ actionTitle: 'Review Purchase Order' });
      expect(lastHttpBody(httpRequest).payload).not.toHaveProperty('actionTitle');
    });

    it('builds a getapproval payload from html and repeated options', async () => {
      const { httpRequest } = await executeWith({
        resource: 'action',
        operation: 'create',
        params: {
          actorId: 'user-1',
          actorType: 'user',
          actionType: 'getapproval',
          callbackUrl: 'https://example.com/callback',
          callbackMethod: 'POST',
          approvalHtml: '<p>Approve?</p>',
          approvalOptions: { option: [{ label: 'Yes' }, { label: 'No' }, { label: '' }] },
          callbackPayloadSpec: '{}',
          dueDate: '',
          priority: 'normal',
          checkIn: '',
          metadata: '{}',
        },
        httpResponse: makeActionResponse(),
      });

      expect(lastHttpBody(httpRequest).payload).toEqual({ html: '<p>Approve?</p>', options: ['Yes', 'No'] });
    });

    it('throws when getapproval has no approval options', async () => {
      await expect(
        executeWith({
          resource: 'action',
          operation: 'create',
          params: {
            actorId: 'user-1',
            actorType: 'user',
            actionType: 'getapproval',
            callbackUrl: 'https://example.com/callback',
            callbackMethod: 'POST',
            approvalHtml: '<p>Approve?</p>',
            approvalOptions: {},
            callbackPayloadSpec: '{}',
            dueDate: '',
            priority: 'normal',
            checkIn: '',
            metadata: '{}',
          },
          httpResponse: makeActionResponse(),
        }),
      ).rejects.toThrow('At least one approval option is required');
    });

    it('throws when getapproval has no HTML', async () => {
      await expect(
        executeWith({
          resource: 'action',
          operation: 'create',
          params: {
            actorId: 'user-1',
            actorType: 'user',
            actionType: 'getapproval',
            callbackUrl: 'https://example.com/callback',
            callbackMethod: 'POST',
            approvalHtml: '',
            approvalOptions: { option: [{ label: 'Approve' }] },
            callbackPayloadSpec: '{}',
            dueDate: '',
            priority: 'normal',
            checkIn: '',
            metadata: '{}',
          },
          httpResponse: makeActionResponse(),
        }),
      ).rejects.toThrow('HTML is required for getapproval actions');
    });

    it('builds a getapproval payload from alternate html and options parameter names', async () => {
      const { httpRequest } = await executeWith({
        resource: 'action',
        operation: 'create',
        params: {
          actorId: 'user-1',
          actorType: 'user',
          actionType: 'getapproval',
          callbackUrl: 'https://example.com/callback',
          callbackMethod: 'POST',
          html: 'Are you giving consent?',
          options: { option: [{ label: 'Yes' }, { label: 'No' }] },
          callbackPayloadSpec: '{}',
          dueDate: '',
          priority: 'normal',
          checkIn: '',
          metadata: '{}',
        },
        httpResponse: makeActionResponse(),
      });

      expect(lastHttpBody(httpRequest).payload).toEqual({ html: 'Are you giving consent?', options: ['Yes', 'No'] });
    });

    it('builds a showform payload from structured fields', async () => {
      const { httpRequest } = await executeWith({
        resource: 'action',
        operation: 'create',
        params: {
          actorId: 'user-1',
          actorType: 'user',
          actionType: 'showform',
          callbackUrl: 'https://example.com/cb',
          callbackMethod: 'POST',
          formName: 'Income Disclosure',
          formId: 'form-123',
          formApiKey: 'chefs-secret', // pragma: allowlist secret
          submissionId: 'submission-456',
          formPreFillData: '{"firstName":"Alice"}',
          callbackPayloadSpec: '{}',
          dueDate: '',
          priority: 'normal',
          checkIn: '',
          metadata: '{}',
        },
        httpResponse: makeActionResponse(),
      });

      expect(lastHttpBody(httpRequest).payload).toEqual({
        formName: 'Income Disclosure',
        formId: 'form-123',
        formApiKey: 'chefs-secret', // pragma: allowlist secret
        submissionId: 'submission-456',
        formPreFillData: { firstName: 'Alice' },
      });
    });

    it('keeps waitonevent payload as parsed JSON', async () => {
      const { httpRequest } = await executeWith({
        resource: 'action',
        operation: 'create',
        params: {
          actorId: 'user-1',
          actorType: 'user',
          actionType: 'waitonevent',
          callbackUrl: 'https://example.com/cb',
          callbackMethod: 'POST',
          payload: '{"eventName":"clicked"}',
          callbackPayloadSpec: '{}',
          dueDate: '',
          priority: 'normal',
          checkIn: '',
          metadata: '{}',
        },
        httpResponse: makeActionResponse(),
      });

      expect(lastHttpBody(httpRequest).payload).toEqual({ eventName: 'clicked' });
    });

    it('marks showform structured fields required in the n8n property config', () => {
      const requiredFieldNames = actionCreateProperties
        .filter((property) => property.displayOptions?.show?.actionType?.includes('showform') && property.required)
        .map((property) => property.name);

      expect(requiredFieldNames).toEqual(expect.arrayContaining(['formName', 'formId', 'formApiKey']));
    });

    it('marks approval options required in the n8n property config', () => {
      const approvalHtml = actionCreateProperties.find((property) => property.name === 'approvalHtml');
      const approvalOptions = actionCreateProperties.find((property) => property.name === 'approvalOptions');
      const optionLabel = approvalOptions?.options?.[0]?.values?.find((property) => property.name === 'label');

      expect(approvalHtml?.required).toBe(true);
      expect(approvalOptions?.required).toBe(true);
      expect(optionLabel?.required).toBe(true);
    });
  });

  describe('get', () => {
    it('calls GET /actions/:actionId', async () => {
      const action = makeActionResponse({ id: 'act-42' });
      const { result, httpRequest } = await executeWith({
        resource: 'action',
        operation: 'get',
        params: { actionId: 'act-42' },
        httpResponse: action,
      });

      expect(lastHttpUrl(httpRequest)).toContain('/actions/act-42');
      expect(result[0][0].json).toMatchObject({ id: 'act-42' });
    });
  });

  describe('getByActor', () => {
    it('calls GET /actors/:actorId/actions with query params', async () => {
      const actions = [makeActionResponse()];
      const { result, httpRequest } = await executeWith({
        resource: 'action',
        operation: 'getByActor',
        params: { actorId: 'user-1', since: '', limit: 50, workflowInstanceId: '' },
        httpResponse: actions,
      });

      expect(lastHttpUrl(httpRequest)).toContain('/actors/user-1/actions');
      expect(result[0]).toHaveLength(1);
    });
  });

  describe('list', () => {
    it('returns a single page when returnAll is false', async () => {
      const items = [makeActionResponse({ id: 'act-1' })];
      const { result, httpRequest } = await executeWith({
        resource: 'action',
        operation: 'list',
        params: { returnAll: false, limit: 25, actorId: '', workflowInstanceId: '', since: '' },
        httpResponse: { items, nextCursor: null },
      });

      expect(httpRequest).toHaveBeenCalledOnce();
      expect(lastHttpQs(httpRequest)).toMatchObject({ limit: 25 });
      expect(result[0]).toHaveLength(1);
    });

    it('paginates through all pages when returnAll is true', async () => {
      const page1 = { items: [makeActionResponse({ id: 'act-1' })], nextCursor: '2025-01-02T00:00:00Z' };
      const page2 = { items: [makeActionResponse({ id: 'act-2' })], nextCursor: null };

      const { result, httpRequest } = await executeWith({
        resource: 'action',
        operation: 'list',
        params: { returnAll: true, actorId: '', workflowInstanceId: '', since: '' },
        httpResponses: [page1, page2],
      });

      expect(httpRequest).toHaveBeenCalledTimes(2);
      expect(result[0]).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('sends PATCH /actions/:actionId with status', async () => {
      const updated = makeActionResponse({ id: 'act-1', status: 'completed' });
      const { result, httpRequest } = await executeWith({
        resource: 'action',
        operation: 'update',
        params: { actionId: 'act-1', status: 'completed' },
        httpResponse: updated,
      });

      expect(lastHttpUrl(httpRequest)).toContain('/actions/act-1');
      expect(lastHttpBody(httpRequest)).toEqual({ status: 'completed' });
      expect(result[0][0].json).toMatchObject({ status: 'completed' });
    });
  });
});
