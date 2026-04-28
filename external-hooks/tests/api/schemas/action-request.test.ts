import { describe, expect, it } from 'vitest';
import {
  createActionRequestSchema,
  listActionsSchema,
  listActorActionsSchema,
  getActionByIdSchema,
  getActorActionByIdSchema,
  patchActionStatusByIdSchema,
  patchActorActionStatusSchema,
  mapActionRequestRowToResponse,
} from '../../../src/api/schemas/action-request';
import { makeActionRequestRow } from '../../helpers/mocks';

/* ------------------------------------------------------------------ */
/*  createActionRequestSchema                                          */
/* ------------------------------------------------------------------ */

describe('createActionRequestSchema', () => {
  const validBody = {
    actionType: 'approval',
    payload: { key: 'value' },
    callbackUrl: 'https://example.com/cb',
    actorId: 'user-1',
    actorType: 'user',
    workflowInstanceId: 'exec-1',
    workflowId: 'wf-1',
  };

  it('accepts a valid body with required fields', () => {
    const result = createActionRequestSchema.parse({ body: validBody });
    expect(result.body.actionType).toBe('approval');
  });

  it('lowercases actorType', () => {
    const result = createActionRequestSchema.parse({ body: { ...validBody, actorType: 'SYSTEM' } });
    expect(result.body.actorType).toBe('system');
  });

  it('lowercases status', () => {
    const result = createActionRequestSchema.parse({ body: { ...validBody, status: 'PENDING' } });
    expect(result.body.status).toBe('pending');
  });

  it('lowercases priority', () => {
    const result = createActionRequestSchema.parse({ body: { ...validBody, priority: 'CRITICAL' } });
    expect(result.body.priority).toBe('critical');
  });

  it('uppercases callbackMethod', () => {
    const result = createActionRequestSchema.parse({ body: { ...validBody, callbackMethod: 'post' } });
    expect(result.body.callbackMethod).toBe('POST');
  });

  it('accepts all valid callbackMethod values', () => {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const result = createActionRequestSchema.parse({ body: { ...validBody, callbackMethod: method } });
      expect(result.body.callbackMethod).toBe(method.toUpperCase());
    }
  });

  it('rejects invalid callbackMethod', () => {
    expect(() => createActionRequestSchema.parse({ body: { ...validBody, callbackMethod: 'OPTIONS' } })).toThrow();
  });

  it('accepts valid dueDate string', () => {
    const result = createActionRequestSchema.parse({
      body: { ...validBody, dueDate: '2025-12-31T00:00:00Z' },
    });
    expect(result.body.dueDate).toBe('2025-12-31T00:00:00Z');
  });

  it('accepts null dueDate', () => {
    const result = createActionRequestSchema.parse({ body: { ...validBody, dueDate: null } });
    expect(result.body.dueDate).toBeNull();
  });

  it('rejects invalid dueDate string', () => {
    expect(() => createActionRequestSchema.parse({ body: { ...validBody, dueDate: 'not-a-date' } })).toThrow();
  });

  it('rejects invalid checkIn string', () => {
    expect(() => createActionRequestSchema.parse({ body: { ...validBody, checkIn: 'bad' } })).toThrow();
  });

  it('rejects unknown body fields (strict)', () => {
    expect(() => createActionRequestSchema.parse({ body: { ...validBody, unknownField: 'x' } })).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => createActionRequestSchema.parse({ body: {} })).toThrow();
  });

  it('accepts optional metadata', () => {
    const result = createActionRequestSchema.parse({
      body: { ...validBody, metadata: { env: 'prod' } },
    });
    expect(result.body.metadata).toEqual({ env: 'prod' });
  });

  it('accepts optional callbackPayloadSpec', () => {
    const result = createActionRequestSchema.parse({
      body: { ...validBody, callbackPayloadSpec: { spec: true } },
    });
    expect(result.body.callbackPayloadSpec).toEqual({ spec: true });
  });

  it('rejects invalid actorType', () => {
    expect(() => createActionRequestSchema.parse({ body: { ...validBody, actorType: 'invalid' } })).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() => createActionRequestSchema.parse({ body: { ...validBody, status: 'unknown' } })).toThrow();
  });

  it('rejects invalid priority', () => {
    expect(() => createActionRequestSchema.parse({ body: { ...validBody, priority: 'low' } })).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  List / Get schemas                                                 */
/* ------------------------------------------------------------------ */

describe('listActionsSchema', () => {
  it('parses valid empty query', () => {
    const result = listActionsSchema.parse({ params: {}, query: {} });
    expect(result.query.actorId).toBeUndefined();
  });

  it('parses query with all optional fields', () => {
    const result = listActionsSchema.parse({
      params: {},
      query: { actorId: 'user-1', limit: '10', since: '2025-01-01T00:00:00Z' },
    });
    expect(result.query.actorId).toBe('user-1');
    expect(result.query.limit).toBe(10);
  });

  it('rejects unknown query params', () => {
    expect(() => listActionsSchema.parse({ params: {}, query: { bad: 'x' } })).toThrow();
  });
});

describe('listActorActionsSchema', () => {
  it('parses valid params', () => {
    const result = listActorActionsSchema.parse({
      params: { actorId: 'user-1' },
      query: {},
    });
    expect(result.params.actorId).toBe('user-1');
  });

  it('rejects empty actorId', () => {
    expect(() => listActorActionsSchema.parse({ params: { actorId: '' }, query: {} })).toThrow();
  });
});

describe('getActionByIdSchema', () => {
  it('parses valid actionId param', () => {
    const result = getActionByIdSchema.parse({ params: { actionId: 'act-1' }, query: {} });
    expect(result.params.actionId).toBe('act-1');
  });

  it('rejects empty actionId', () => {
    expect(() => getActionByIdSchema.parse({ params: { actionId: '' }, query: {} })).toThrow();
  });
});

describe('getActorActionByIdSchema', () => {
  it('parses valid actorId and actionId', () => {
    const result = getActorActionByIdSchema.parse({
      params: { actorId: 'user-1', actionId: 'act-1' },
      query: {},
    });
    expect(result.params.actorId).toBe('user-1');
    expect(result.params.actionId).toBe('act-1');
  });
});

/* ------------------------------------------------------------------ */
/*  Patch schemas                                                      */
/* ------------------------------------------------------------------ */

describe('patchActionStatusByIdSchema', () => {
  it('parses valid status', () => {
    const result = patchActionStatusByIdSchema.parse({
      params: { actionId: 'act-1' },
      body: { status: 'completed' },
    });
    expect(result.body.status).toBe('completed');
  });

  it('lowercases status', () => {
    const result = patchActionStatusByIdSchema.parse({
      params: { actionId: 'act-1' },
      body: { status: 'CANCELLED' },
    });
    expect(result.body.status).toBe('cancelled');
  });

  it('rejects invalid status', () => {
    expect(() =>
      patchActionStatusByIdSchema.parse({
        params: { actionId: 'act-1' },
        body: { status: 'invalid' },
      }),
    ).toThrow();
  });

  it('accepts all valid status values', () => {
    for (const status of ['pending', 'in_progress', 'completed', 'cancelled', 'expired', 'deleted']) {
      const result = patchActionStatusByIdSchema.parse({
        params: { actionId: 'act-1' },
        body: { status },
      });
      expect(result.body.status).toBe(status);
    }
  });
});

describe('patchActorActionStatusSchema', () => {
  it('parses valid params and body', () => {
    const result = patchActorActionStatusSchema.parse({
      params: { actorId: 'user-1', actionId: 'act-1' },
      body: { status: 'completed' },
    });
    expect(result.params.actorId).toBe('user-1');
    expect(result.body.status).toBe('completed');
  });
});

/* ------------------------------------------------------------------ */
/*  mapActionRequestRowToResponse                                      */
/* ------------------------------------------------------------------ */

describe('mapActionRequestRowToResponse', () => {
  it('maps a DB row to the expected response shape', () => {
    const row = makeActionRequestRow();
    const result = mapActionRequestRowToResponse(row as any);
    expect(result.id).toBe(row.id);
    expect(result.actionType).toBe(row.actionType);
    expect(result.callbackMethod).toBe(row.callbackMethod);
    expect(result.status).toBe(row.status);
    expect(result.priority).toBe(row.priority);
    expect(result.dueDate).toBeNull();
    expect(result.checkIn).toBeNull();
  });

  it('maps non-null dueDate and checkIn', () => {
    const due = new Date('2025-12-31T00:00:00Z');
    const check = new Date('2025-12-15T00:00:00Z');
    const row = makeActionRequestRow({ dueDate: due, checkIn: check });
    const result = mapActionRequestRowToResponse(row as any);
    expect(result.dueDate).toEqual(due);
    expect(result.checkIn).toEqual(check);
  });
});
