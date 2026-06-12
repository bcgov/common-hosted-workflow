/**
 * Unit tests for `src/api/routes/helpers/wil-response.ts`.
 */
import { describe, expect, it } from 'vitest';
import { formatListResponse, mapActionToUiResponse } from '../../../../src/api/routes/helpers/wil-response';
import type { ActionRequest } from '../../../../src/db/schema/workflow-interaction-layer';

function makeItem(id: string, createdAt: Date = new Date('2025-06-01T12:00:00.000Z')) {
  return { id, createdAt, title: `Item ${id}` };
}

function makeActionRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    actionType: 'getapproval',
    payload: { html: '<p>Hello</p>', options: ['Approve', 'Reject'] },
    callbackUrl: 'https://internal.example.com/webhook/123',
    callbackMethod: 'POST',
    callbackPayloadSpec: { format: 'json' },
    actorId: 'user-42',
    actorType: 'user',
    workflowInstanceId: 'exec-abc',
    workflowId: 'wf-xyz',
    projectId: 'proj-001',
    createdAt: new Date('2025-06-01T12:00:00.000Z'),
    updatedAt: new Date('2025-06-01T13:00:00.000Z'),
    status: 'pending',
    priority: 'normal',
    dueDate: null,
    checkIn: new Date('2025-06-02T10:00:00.000Z'),
    metadata: { source: 'n8n' },
    ...overrides,
  };
}

describe('formatListResponse', () => {
  it('returns null nextCursor when items are fewer than limit', () => {
    const items = [makeItem('a'), makeItem('b')];
    const result = formatListResponse(items, 10);

    expect(result.data).toEqual(items);
    expect(result.nextCursor).toBeNull();
  });

  it('returns null nextCursor when items list is empty', () => {
    const result = formatListResponse([], 20);

    expect(result.data).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('returns a cursor when items.length equals limit', () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    const result = formatListResponse(items, 3);

    expect(result.nextCursor).not.toBeNull();
  });

  it('cursor format is ISO|id of the last item', () => {
    const lastDate = new Date('2025-06-15T08:30:00.000Z');
    const items = [makeItem('first'), makeItem('last', lastDate)];
    const result = formatListResponse(items, 2);

    expect(result.nextCursor).toBe(`${lastDate.toISOString()}|last`);
  });

  it('preserves all item data in the response', () => {
    const items = [{ id: 'x', createdAt: new Date('2025-01-01T00:00:00.000Z'), extra: 'data' }];
    const result = formatListResponse(items, 5);

    expect(result.data[0]).toEqual(items[0]);
  });

  it('returns null nextCursor when limit is 1 and only 0 items', () => {
    const result = formatListResponse([], 1);

    expect(result.nextCursor).toBeNull();
  });

  it('returns cursor when exactly 1 item matches limit of 1', () => {
    const date = new Date('2025-03-10T14:00:00.000Z');
    const items = [makeItem('only-one', date)];
    const result = formatListResponse(items, 1);

    expect(result.nextCursor).toBe(`${date.toISOString()}|only-one`);
  });
});

describe('mapActionToUiResponse', () => {
  it('strips all sensitive fields from the response', () => {
    const action = makeActionRequest();
    const result = mapActionToUiResponse(action);

    expect(result).not.toHaveProperty('callbackUrl');
    expect(result).not.toHaveProperty('callbackMethod');
    expect(result).not.toHaveProperty('callbackPayloadSpec');
    expect(result).not.toHaveProperty('metadata');
    expect(result).not.toHaveProperty('workflowInstanceId');
    expect(result).not.toHaveProperty('workflowId');
    expect(result).not.toHaveProperty('projectId');
    expect(result).not.toHaveProperty('actorType');
    expect(result).not.toHaveProperty('checkIn');
  });

  it('preserves allowed fields in the response', () => {
    const action = makeActionRequest();
    const result = mapActionToUiResponse(action);

    expect(result.id).toBe(action.id);
    expect(result.actionType).toBe(action.actionType);
    expect(result.actorId).toBe(action.actorId);
    expect(result.status).toBe(action.status);
    expect(result.priority).toBe(action.priority);
    expect(result.dueDate).toBe(action.dueDate);
    expect(result.createdAt).toBe(action.createdAt);
    expect(result.updatedAt).toBe(action.updatedAt);
  });

  it('preserves payload fields for non-showform actions', () => {
    const action = makeActionRequest({
      actionType: 'getapproval',
      payload: { html: '<p>Test</p>', options: ['Yes', 'No'] },
    });
    const result = mapActionToUiResponse(action);

    expect(result.payload).toEqual({ html: '<p>Test</p>', options: ['Yes', 'No'] });
  });

  it('removes formApiKey from showform payloads', () => {
    const action = makeActionRequest({
      actionType: 'showform',
      payload: { formApiKey: 'secret-key', formId: 'form-1', formName: 'My Form' }, // pragma: allowlist secret
    });
    const result = mapActionToUiResponse(action);

    expect(result.payload).toEqual({ formId: 'form-1', formName: 'My Form' });
    expect(result.payload).not.toHaveProperty('formApiKey');
  });

  it('removes formapikey regardless of casing in showform payloads', () => {
    const action = makeActionRequest({
      actionType: 'showform',
      payload: { FORMAPIKEY: 'secret', formId: 'f1' }, // pragma: allowlist secret
    });
    const result = mapActionToUiResponse(action);

    expect(result.payload).not.toHaveProperty('FORMAPIKEY');
    expect(result.payload).toEqual({ formId: 'f1' });
  });

  it('does not remove formapikey from non-showform actions', () => {
    const action = makeActionRequest({
      actionType: 'getapproval',
      payload: { formApiKey: 'should-stay', html: '<p>hi</p>' }, // pragma: allowlist secret
    });
    const result = mapActionToUiResponse(action);

    expect(result.payload).toHaveProperty('formApiKey', 'should-stay');
  });

  it('does not mutate the original action payload', () => {
    const originalPayload = { formApiKey: 'secret', formId: 'form-1' }; // pragma: allowlist secret
    const action = makeActionRequest({
      actionType: 'showform',
      payload: originalPayload,
    });
    mapActionToUiResponse(action);

    expect(originalPayload).toHaveProperty('formApiKey', 'secret');
  });
});
