'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
/**
 * Unit tests for `src/api/routes/helpers/wil-response.ts`.
 */
const vitest_1 = require('vitest');
const wil_response_1 = require('../../../../src/api/routes/helpers/wil-response');
function makeItem(id, createdAt = new Date('2025-06-01T12:00:00.000Z')) {
  return { id, createdAt, title: `Item ${id}` };
}
function makeActionRequest(overrides = {}) {
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
    actionTitle: null,
    priority: 'normal',
    dueDate: null,
    checkIn: new Date('2025-06-02T10:00:00.000Z'),
    metadata: { source: 'n8n' },
    claimedBy: null,
    claimedAt: null,
    completedBy: null,
    completedAt: null,
    ...overrides,
  };
}
(0, vitest_1.describe)('formatListResponse', () => {
  (0, vitest_1.it)('returns null nextCursor when hasMore is false', () => {
    const items = [makeItem('a'), makeItem('b')];
    const result = (0, wil_response_1.formatListResponse)(items, false);
    (0, vitest_1.expect)(result.data).toEqual(items);
    (0, vitest_1.expect)(result.nextCursor).toBeNull();
  });
  (0, vitest_1.it)('returns null nextCursor when items list is empty', () => {
    const result = (0, wil_response_1.formatListResponse)([], false);
    (0, vitest_1.expect)(result.data).toEqual([]);
    (0, vitest_1.expect)(result.nextCursor).toBeNull();
  });
  (0, vitest_1.it)('returns a cursor when hasMore is true', () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    const result = (0, wil_response_1.formatListResponse)(items, true);
    (0, vitest_1.expect)(result.nextCursor).not.toBeNull();
  });
  (0, vitest_1.it)('cursor format is ISO|id of the last item', () => {
    const lastDate = new Date('2025-06-15T08:30:00.000Z');
    const items = [makeItem('first'), makeItem('last', lastDate)];
    const result = (0, wil_response_1.formatListResponse)(items, true);
    (0, vitest_1.expect)(result.nextCursor).toBe(`${lastDate.toISOString()}|last`);
  });
  (0, vitest_1.it)('preserves all item data in the response', () => {
    const items = [{ id: 'x', createdAt: new Date('2025-01-01T00:00:00.000Z'), extra: 'data' }];
    const result = (0, wil_response_1.formatListResponse)(items, false);
    (0, vitest_1.expect)(result.data[0]).toEqual(items[0]);
  });
  (0, vitest_1.it)('returns null nextCursor when hasMore is true but items is empty', () => {
    // Defensive case: hasMore should never be true with no items, but the
    // function still falls back to null since there's no last row to encode.
    const result = (0, wil_response_1.formatListResponse)([], true);
    (0, vitest_1.expect)(result.nextCursor).toBeNull();
  });
  (0, vitest_1.it)('returns cursor for a single item when hasMore is true', () => {
    const date = new Date('2025-03-10T14:00:00.000Z');
    const items = [makeItem('only-one', date)];
    const result = (0, wil_response_1.formatListResponse)(items, true);
    (0, vitest_1.expect)(result.nextCursor).toBe(`${date.toISOString()}|only-one`);
  });
});
(0, vitest_1.describe)('mapActionToUiResponse', () => {
  (0, vitest_1.it)('strips all sensitive fields from the response', () => {
    const action = makeActionRequest();
    const result = (0, wil_response_1.mapActionToUiResponse)(action);
    (0, vitest_1.expect)(result).not.toHaveProperty('callbackUrl');
    (0, vitest_1.expect)(result).not.toHaveProperty('callbackMethod');
    (0, vitest_1.expect)(result).not.toHaveProperty('callbackPayloadSpec');
    (0, vitest_1.expect)(result).not.toHaveProperty('metadata');
    (0, vitest_1.expect)(result).not.toHaveProperty('workflowInstanceId');
    (0, vitest_1.expect)(result).not.toHaveProperty('workflowId');
    (0, vitest_1.expect)(result).not.toHaveProperty('projectId');
    (0, vitest_1.expect)(result).not.toHaveProperty('checkIn');
  });
  (0, vitest_1.it)('preserves allowed fields in the response', () => {
    const action = makeActionRequest();
    const result = (0, wil_response_1.mapActionToUiResponse)(action);
    (0, vitest_1.expect)(result.id).toBe(action.id);
    (0, vitest_1.expect)(result.actionType).toBe(action.actionType);
    (0, vitest_1.expect)(result.actionTitle).toBe(action.actionTitle);
    (0, vitest_1.expect)(result.actorId).toBe(action.actorId);
    (0, vitest_1.expect)(result.actorType).toBe(action.actorType);
    (0, vitest_1.expect)(result.status).toBe(action.status);
    (0, vitest_1.expect)(result.priority).toBe(action.priority);
    (0, vitest_1.expect)(result.dueDate).toBe(action.dueDate);
    (0, vitest_1.expect)(result.createdAt).toBe(action.createdAt);
    (0, vitest_1.expect)(result.updatedAt).toBe(action.updatedAt);
  });
  (0, vitest_1.it)('preserves actionTitle when present', () => {
    const action = makeActionRequest({ actionTitle: 'Ask actor for approval' });
    const result = (0, wil_response_1.mapActionToUiResponse)(action);
    (0, vitest_1.expect)(result.actionTitle).toBe('Ask actor for approval');
  });
  (0, vitest_1.it)('preserves payload fields for non-showform actions', () => {
    const action = makeActionRequest({
      actionType: 'getapproval',
      payload: { html: '<p>Test</p>', options: ['Yes', 'No'] },
    });
    const result = (0, wil_response_1.mapActionToUiResponse)(action);
    (0, vitest_1.expect)(result.payload).toEqual({ html: '<p>Test</p>', options: ['Yes', 'No'] });
  });
  (0, vitest_1.it)('removes formApiKey from showform payloads', () => {
    const action = makeActionRequest({
      actionType: 'showform',
      payload: { formApiKey: 'secret-key', formId: 'form-1', formName: 'My Form' }, // pragma: allowlist secret
    });
    const result = (0, wil_response_1.mapActionToUiResponse)(action);
    (0, vitest_1.expect)(result.payload).toEqual({ formId: 'form-1', formName: 'My Form' });
    (0, vitest_1.expect)(result.payload).not.toHaveProperty('formApiKey');
  });
  (0, vitest_1.it)('removes formapikey regardless of casing in showform payloads', () => {
    const action = makeActionRequest({
      actionType: 'showform',
      payload: { FORMAPIKEY: 'secret', formId: 'f1' }, // pragma: allowlist secret
    });
    const result = (0, wil_response_1.mapActionToUiResponse)(action);
    (0, vitest_1.expect)(result.payload).not.toHaveProperty('FORMAPIKEY');
    (0, vitest_1.expect)(result.payload).toEqual({ formId: 'f1' });
  });
  (0, vitest_1.it)('does not remove formapikey from non-showform actions', () => {
    const action = makeActionRequest({
      actionType: 'getapproval',
      payload: { formApiKey: 'should-stay', html: '<p>hi</p>' }, // pragma: allowlist secret
    });
    const result = (0, wil_response_1.mapActionToUiResponse)(action);
    (0, vitest_1.expect)(result.payload).toHaveProperty('formApiKey', 'should-stay');
  });
  (0, vitest_1.it)('does not mutate the original action payload', () => {
    const originalPayload = { formApiKey: 'secret', formId: 'form-1' }; // pragma: allowlist secret
    const action = makeActionRequest({
      actionType: 'showform',
      payload: originalPayload,
    });
    (0, wil_response_1.mapActionToUiResponse)(action);
    (0, vitest_1.expect)(originalPayload).toHaveProperty('formApiKey', 'secret');
  });
  (0, vitest_1.it)('surfaces cancellationReason from metadata', () => {
    const action = makeActionRequest({
      status: 'cancelled',
      metadata: { source: 'n8n', cancellationReason: 'The workflow has already finished.' },
    });
    const result = (0, wil_response_1.mapActionToUiResponse)(action);
    (0, vitest_1.expect)(result.cancellationReason).toBe('The workflow has already finished.');
  });
  (0, vitest_1.it)('returns null cancellationReason when metadata has no reason', () => {
    const action = makeActionRequest({ metadata: { source: 'n8n' } });
    const result = (0, wil_response_1.mapActionToUiResponse)(action);
    (0, vitest_1.expect)(result.cancellationReason).toBeNull();
  });
  (0, vitest_1.it)('returns null cancellationReason when metadata is null', () => {
    const action = makeActionRequest({ metadata: null });
    const result = (0, wil_response_1.mapActionToUiResponse)(action);
    (0, vitest_1.expect)(result.cancellationReason).toBeNull();
  });
});
