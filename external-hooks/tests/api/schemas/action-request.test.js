'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const action_request_1 = require('../../../src/api/schemas/action-request');
const mocks_1 = require('../../helpers/mocks');
/* ------------------------------------------------------------------ */
/*  createActionRequestSchema                                          */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('createActionRequestSchema', () => {
  const validBody = {
    actionType: 'approval',
    payload: { key: 'value' },
    callbackUrl: 'https://example.com/cb',
    actorId: 'user-1',
    actorType: 'user',
    workflowInstanceId: 'exec-1',
    workflowId: 'wf-1',
  };
  (0, vitest_1.it)('accepts a valid body with required fields', () => {
    const result = action_request_1.createActionRequestSchema.parse({ body: validBody });
    (0, vitest_1.expect)(result.body.actionType).toBe('approval');
  });
  (0, vitest_1.it)('lowercases actorType', () => {
    const result = action_request_1.createActionRequestSchema.parse({ body: { ...validBody, actorType: 'SYSTEM' } });
    (0, vitest_1.expect)(result.body.actorType).toBe('system');
  });
  (0, vitest_1.it)('lowercases status', () => {
    const result = action_request_1.createActionRequestSchema.parse({ body: { ...validBody, status: 'PENDING' } });
    (0, vitest_1.expect)(result.body.status).toBe('pending');
  });
  (0, vitest_1.it)('lowercases priority', () => {
    const result = action_request_1.createActionRequestSchema.parse({ body: { ...validBody, priority: 'CRITICAL' } });
    (0, vitest_1.expect)(result.body.priority).toBe('critical');
  });
  (0, vitest_1.it)('uppercases callbackMethod', () => {
    const result = action_request_1.createActionRequestSchema.parse({ body: { ...validBody, callbackMethod: 'post' } });
    (0, vitest_1.expect)(result.body.callbackMethod).toBe('POST');
  });
  (0, vitest_1.it)('accepts all valid callbackMethod values', () => {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'none']) {
      const body =
        method === 'none'
          ? { ...validBody, callbackMethod: method, callbackUrl: '' }
          : { ...validBody, callbackMethod: method };
      const result = action_request_1.createActionRequestSchema.parse({ body });
      (0, vitest_1.expect)(result.body.callbackMethod).toBe(method.toUpperCase());
    }
  });
  (0, vitest_1.it)('rejects invalid callbackMethod', () => {
    (0, vitest_1.expect)(() =>
      action_request_1.createActionRequestSchema.parse({ body: { ...validBody, callbackMethod: 'OPTIONS' } }),
    ).toThrow();
  });
  (0, vitest_1.it)('allows empty callbackUrl when callbackMethod is none', () => {
    const result = action_request_1.createActionRequestSchema.parse({
      body: { ...validBody, callbackUrl: '', callbackMethod: 'none' },
    });
    (0, vitest_1.expect)(result.body.callbackMethod).toBe('NONE');
    (0, vitest_1.expect)(result.body.callbackUrl).toBe('');
  });
  (0, vitest_1.it)('rejects empty callbackUrl when callbackMethod is not none', () => {
    (0, vitest_1.expect)(() =>
      action_request_1.createActionRequestSchema.parse({
        body: { ...validBody, callbackUrl: '', callbackMethod: 'post' },
      }),
    ).toThrow();
  });
  (0, vitest_1.it)('accepts valid dueDate string', () => {
    const result = action_request_1.createActionRequestSchema.parse({
      body: { ...validBody, dueDate: '2025-12-31T00:00:00Z' },
    });
    (0, vitest_1.expect)(result.body.dueDate).toBe('2025-12-31T00:00:00Z');
  });
  (0, vitest_1.it)('accepts null dueDate', () => {
    const result = action_request_1.createActionRequestSchema.parse({ body: { ...validBody, dueDate: null } });
    (0, vitest_1.expect)(result.body.dueDate).toBeNull();
  });
  (0, vitest_1.it)('rejects invalid dueDate string', () => {
    (0, vitest_1.expect)(() =>
      action_request_1.createActionRequestSchema.parse({ body: { ...validBody, dueDate: 'not-a-date' } }),
    ).toThrow();
  });
  (0, vitest_1.it)('rejects invalid checkIn string', () => {
    (0, vitest_1.expect)(() =>
      action_request_1.createActionRequestSchema.parse({ body: { ...validBody, checkIn: 'bad' } }),
    ).toThrow();
  });
  (0, vitest_1.it)('rejects unknown body fields (strict)', () => {
    (0, vitest_1.expect)(() =>
      action_request_1.createActionRequestSchema.parse({ body: { ...validBody, unknownField: 'x' } }),
    ).toThrow();
  });
  (0, vitest_1.it)('rejects missing required fields', () => {
    (0, vitest_1.expect)(() => action_request_1.createActionRequestSchema.parse({ body: {} })).toThrow();
  });
  (0, vitest_1.it)('accepts optional metadata', () => {
    const result = action_request_1.createActionRequestSchema.parse({
      body: { ...validBody, metadata: { env: 'prod' } },
    });
    (0, vitest_1.expect)(result.body.metadata).toEqual({ env: 'prod' });
  });
  (0, vitest_1.it)('accepts optional callbackPayloadSpec', () => {
    const result = action_request_1.createActionRequestSchema.parse({
      body: { ...validBody, callbackPayloadSpec: { spec: true } },
    });
    (0, vitest_1.expect)(result.body.callbackPayloadSpec).toEqual({ spec: true });
  });
  (0, vitest_1.it)('rejects invalid actorType', () => {
    (0, vitest_1.expect)(() =>
      action_request_1.createActionRequestSchema.parse({ body: { ...validBody, actorType: 'invalid' } }),
    ).toThrow();
  });
  (0, vitest_1.it)('rejects invalid status', () => {
    (0, vitest_1.expect)(() =>
      action_request_1.createActionRequestSchema.parse({ body: { ...validBody, status: 'unknown' } }),
    ).toThrow();
  });
  (0, vitest_1.it)('rejects invalid priority', () => {
    (0, vitest_1.expect)(() =>
      action_request_1.createActionRequestSchema.parse({ body: { ...validBody, priority: 'low' } }),
    ).toThrow();
  });
});
/* ------------------------------------------------------------------ */
/*  List / Get schemas                                                 */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('listActionsSchema', () => {
  (0, vitest_1.it)('parses valid empty query', () => {
    const result = action_request_1.listActionsSchema.parse({ params: {}, query: {} });
    (0, vitest_1.expect)(result.query.actorId).toBeUndefined();
  });
  (0, vitest_1.it)('parses query with all optional fields', () => {
    const result = action_request_1.listActionsSchema.parse({
      params: {},
      query: { actorId: 'user-1', limit: '10', since: '2025-01-01T00:00:00Z' },
    });
    (0, vitest_1.expect)(result.query.actorId).toBe('user-1');
    (0, vitest_1.expect)(result.query.limit).toBe(10);
  });
  (0, vitest_1.it)('rejects unknown query params', () => {
    (0, vitest_1.expect)(() => action_request_1.listActionsSchema.parse({ params: {}, query: { bad: 'x' } })).toThrow();
  });
});
(0, vitest_1.describe)('listActorActionsSchema', () => {
  (0, vitest_1.it)('parses valid params', () => {
    const result = action_request_1.listActorActionsSchema.parse({
      params: { actorId: 'user-1' },
      query: {},
    });
    (0, vitest_1.expect)(result.params.actorId).toBe('user-1');
  });
  (0, vitest_1.it)('rejects empty actorId', () => {
    (0, vitest_1.expect)(() =>
      action_request_1.listActorActionsSchema.parse({ params: { actorId: '' }, query: {} }),
    ).toThrow();
  });
});
(0, vitest_1.describe)('getActionByIdSchema', () => {
  (0, vitest_1.it)('parses valid actionId param', () => {
    const result = action_request_1.getActionByIdSchema.parse({ params: { actionId: 'act-1' }, query: {} });
    (0, vitest_1.expect)(result.params.actionId).toBe('act-1');
  });
  (0, vitest_1.it)('rejects empty actionId', () => {
    (0, vitest_1.expect)(() =>
      action_request_1.getActionByIdSchema.parse({ params: { actionId: '' }, query: {} }),
    ).toThrow();
  });
});
(0, vitest_1.describe)('getActorActionByIdSchema', () => {
  (0, vitest_1.it)('parses valid actorId and actionId', () => {
    const result = action_request_1.getActorActionByIdSchema.parse({
      params: { actorId: 'user-1', actionId: 'act-1' },
      query: {},
    });
    (0, vitest_1.expect)(result.params.actorId).toBe('user-1');
    (0, vitest_1.expect)(result.params.actionId).toBe('act-1');
  });
});
/* ------------------------------------------------------------------ */
/*  Patch schemas                                                      */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('patchActionStatusByIdSchema', () => {
  (0, vitest_1.it)('parses valid status', () => {
    const result = action_request_1.patchActionStatusByIdSchema.parse({
      params: { actionId: 'act-1' },
      body: { status: 'completed' },
    });
    (0, vitest_1.expect)(result.body.status).toBe('completed');
  });
  (0, vitest_1.it)('lowercases status', () => {
    const result = action_request_1.patchActionStatusByIdSchema.parse({
      params: { actionId: 'act-1' },
      body: { status: 'CANCELLED' },
    });
    (0, vitest_1.expect)(result.body.status).toBe('cancelled');
  });
  (0, vitest_1.it)('rejects invalid status', () => {
    (0, vitest_1.expect)(() =>
      action_request_1.patchActionStatusByIdSchema.parse({
        params: { actionId: 'act-1' },
        body: { status: 'invalid' },
      }),
    ).toThrow();
  });
  (0, vitest_1.it)('accepts all valid status values', () => {
    for (const status of ['pending', 'in_progress', 'completed', 'cancelled', 'expired', 'deleted']) {
      const result = action_request_1.patchActionStatusByIdSchema.parse({
        params: { actionId: 'act-1' },
        body: { status },
      });
      (0, vitest_1.expect)(result.body.status).toBe(status);
    }
  });
});
(0, vitest_1.describe)('patchActorActionStatusSchema', () => {
  (0, vitest_1.it)('parses valid params and body', () => {
    const result = action_request_1.patchActorActionStatusSchema.parse({
      params: { actorId: 'user-1', actionId: 'act-1' },
      body: { status: 'completed' },
    });
    (0, vitest_1.expect)(result.params.actorId).toBe('user-1');
    (0, vitest_1.expect)(result.body.status).toBe('completed');
  });
});
/* ------------------------------------------------------------------ */
/*  mapActionRequestRowToResponse                                      */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('mapActionRequestRowToResponse', () => {
  (0, vitest_1.it)('maps a DB row to the expected response shape', () => {
    const row = (0, mocks_1.makeActionRequestRow)();
    const result = (0, action_request_1.mapActionRequestRowToResponse)(row);
    (0, vitest_1.expect)(result.id).toBe(row.id);
    (0, vitest_1.expect)(result.actionType).toBe(row.actionType);
    (0, vitest_1.expect)(result.actionTitle).toBeNull();
    (0, vitest_1.expect)(result.callbackMethod).toBe(row.callbackMethod);
    (0, vitest_1.expect)(result.status).toBe(row.status);
    (0, vitest_1.expect)(result.priority).toBe(row.priority);
    (0, vitest_1.expect)(result.dueDate).toBeNull();
    (0, vitest_1.expect)(result.checkIn).toBeNull();
  });
  (0, vitest_1.it)('maps non-null dueDate and checkIn', () => {
    const due = new Date('2025-12-31T00:00:00Z');
    const check = new Date('2025-12-15T00:00:00Z');
    const row = (0, mocks_1.makeActionRequestRow)({ dueDate: due, checkIn: check });
    const result = (0, action_request_1.mapActionRequestRowToResponse)(row);
    (0, vitest_1.expect)(result.dueDate).toEqual(due);
    (0, vitest_1.expect)(result.checkIn).toEqual(check);
  });
  (0, vitest_1.it)('maps non-null actionTitle', () => {
    const row = (0, mocks_1.makeActionRequestRow)({ actionTitle: 'Review Purchase Order' });
    const result = (0, action_request_1.mapActionRequestRowToResponse)(row);
    (0, vitest_1.expect)(result.actionTitle).toBe('Review Purchase Order');
  });
  (0, vitest_1.it)('maps missing actionTitle (undefined) as null', () => {
    const { actionTitle: _, ...rowWithoutTitle } = (0, mocks_1.makeActionRequestRow)();
    const result = (0, action_request_1.mapActionRequestRowToResponse)(rowWithoutTitle);
    (0, vitest_1.expect)(result.actionTitle).toBeNull();
  });
});
