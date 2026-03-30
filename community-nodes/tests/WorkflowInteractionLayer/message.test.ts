import { describe, expect, it } from 'vitest';
import {
  executeWith,
  lastHttpBody,
  lastHttpUrl,
  lastHttpQs,
  makeMessageResponse,
  MOCK_EXECUTION_ID,
  MOCK_WORKFLOW,
} from './helpers';

describe('WorkflowInteractionLayer — Message', () => {
  describe('create', () => {
    it('sends a correctly shaped POST to /messages', async () => {
      const msg = makeMessageResponse();
      const { result, httpRequest } = await executeWith({
        resource: 'message',
        operation: 'create',
        params: {
          actorId: 'user-1',
          actorType: 'user',
          title: 'Hello',
          body: 'World',
          metadata: '{}',
        },
        httpResponse: msg,
      });

      expect(httpRequest).toHaveBeenCalledOnce();
      expect(lastHttpUrl(httpRequest)).toContain('/messages');
      expect(lastHttpBody(httpRequest)).toMatchObject({
        workflowInstanceId: MOCK_EXECUTION_ID,
        workflowId: MOCK_WORKFLOW.id,
        actorId: 'user-1',
        actorType: 'user',
        title: 'Hello',
        body: 'World',
      });
      expect(result[0][0].json).toEqual(msg);
    });

    it('includes metadata when provided', async () => {
      const meta = { priority: 'high' };
      await executeWith({
        resource: 'message',
        operation: 'create',
        params: {
          actorId: 'user-1',
          actorType: 'user',
          title: 'T',
          body: 'B',
          metadata: JSON.stringify(meta),
        },
        httpResponse: makeMessageResponse(),
      }).then(({ httpRequest }) => {
        expect(lastHttpBody(httpRequest).metadata).toEqual(meta);
      });
    });
  });

  describe('list', () => {
    it('returns a single page when returnAll is false', async () => {
      const items = [makeMessageResponse({ id: 'msg-1' }), makeMessageResponse({ id: 'msg-2' })];
      const { result, httpRequest } = await executeWith({
        resource: 'message',
        operation: 'list',
        params: { returnAll: false, limit: 10, actorId: '', workflowInstanceId: '', since: '' },
        httpResponse: { items, nextCursor: null },
      });

      expect(httpRequest).toHaveBeenCalledOnce();
      expect(lastHttpQs(httpRequest)).toMatchObject({ limit: 10 });
      expect(result[0]).toHaveLength(2);
    });

    it('paginates through all pages when returnAll is true', async () => {
      const page1 = { items: [makeMessageResponse({ id: 'msg-1' })], nextCursor: '2025-01-02T00:00:00Z' };
      const page2 = { items: [makeMessageResponse({ id: 'msg-2' })], nextCursor: null };

      const { result, httpRequest } = await executeWith({
        resource: 'message',
        operation: 'list',
        params: { returnAll: true, actorId: '', workflowInstanceId: '', since: '' },
        httpResponses: [page1, page2],
      });

      expect(httpRequest).toHaveBeenCalledTimes(2);
      expect(result[0]).toHaveLength(2);
      expect(result[0][0].json).toMatchObject({ id: 'msg-1' });
      expect(result[0][1].json).toMatchObject({ id: 'msg-2' });
    });

    it('passes optional query filters', async () => {
      await executeWith({
        resource: 'message',
        operation: 'list',
        params: {
          returnAll: false,
          limit: 50,
          actorId: 'user-1',
          workflowInstanceId: 'exec-1',
          since: '2025-06-01T00:00:00Z',
        },
        httpResponse: { items: [], nextCursor: null },
      }).then(({ httpRequest }) => {
        expect(lastHttpQs(httpRequest)).toMatchObject({
          actorId: 'user-1',
          workflowInstanceId: 'exec-1',
          since: '2025-06-01T00:00:00Z',
          limit: 50,
        });
      });
    });
  });

  describe('getByActor', () => {
    it('calls GET /actors/:actorId/messages with query params', async () => {
      const msgs = [makeMessageResponse()];
      const { result, httpRequest } = await executeWith({
        resource: 'message',
        operation: 'getByActor',
        params: { actorId: 'user-1', since: '', limit: 50, workflowInstanceId: '' },
        httpResponse: msgs,
      });

      expect(lastHttpUrl(httpRequest)).toContain('/actors/user-1/messages');
      expect(result[0]).toHaveLength(1);
    });
  });
});
