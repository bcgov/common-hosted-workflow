import { describe, expect, it } from 'vitest';
import {
  createMessageSchema,
  listActorMessagesSchema,
  listMessagesSchema,
  mapMessageRowToResponse,
} from '../../../src/api/schemas/message';
import { makeMessageRow } from '../../helpers/mocks';

/* ------------------------------------------------------------------ */
/*  createMessageSchema                                                */
/* ------------------------------------------------------------------ */

describe('createMessageSchema', () => {
  const validBody = {
    title: 'Alert',
    body: 'Something happened',
    actorId: 'user-1',
    actorType: 'user',
    workflowInstanceId: 'exec-1',
    workflowId: 'wf-1',
  };

  it('accepts a valid body with required fields', () => {
    const result = createMessageSchema.parse({ body: validBody });
    expect(result.body.title).toBe('Alert');
    expect(result.body.actorType).toBe('user');
  });

  it('lowercases actorType', () => {
    const result = createMessageSchema.parse({ body: { ...validBody, actorType: 'USER' } });
    expect(result.body.actorType).toBe('user');
  });

  it('lowercases status', () => {
    const result = createMessageSchema.parse({ body: { ...validBody, status: 'READ' } });
    expect(result.body.status).toBe('read');
  });

  it('accepts optional metadata as object', () => {
    const result = createMessageSchema.parse({ body: { ...validBody, metadata: { key: 'val' } } });
    expect(result.body.metadata).toEqual({ key: 'val' });
  });

  it('accepts null metadata', () => {
    const result = createMessageSchema.parse({ body: { ...validBody, metadata: null } });
    expect(result.body.metadata).toBeNull();
  });

  it('rejects missing title', () => {
    const { title, ...noTitle } = validBody;
    expect(() => createMessageSchema.parse({ body: noTitle })).toThrow();
  });

  it('rejects empty body field', () => {
    expect(() => createMessageSchema.parse({ body: { ...validBody, body: '' } })).toThrow();
  });

  it('rejects invalid actorType', () => {
    expect(() => createMessageSchema.parse({ body: { ...validBody, actorType: 'invalid' } })).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() => createMessageSchema.parse({ body: { ...validBody, status: 'deleted' } })).toThrow();
  });

  it('accepts all valid actorType values', () => {
    for (const actorType of ['user', 'role', 'group', 'system', 'other']) {
      const result = createMessageSchema.parse({ body: { ...validBody, actorType } });
      expect(result.body.actorType).toBe(actorType);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  listActorMessagesSchema                                            */
/* ------------------------------------------------------------------ */

describe('listActorMessagesSchema', () => {
  it('parses valid params and empty query', () => {
    const result = listActorMessagesSchema.parse({
      params: { actorId: 'user-1' },
      query: {},
    });
    expect(result.params.actorId).toBe('user-1');
  });

  it('rejects empty actorId', () => {
    expect(() =>
      listActorMessagesSchema.parse({
        params: { actorId: '' },
        query: {},
      }),
    ).toThrow();
  });

  it('rejects unknown query params (strict)', () => {
    expect(() =>
      listActorMessagesSchema.parse({
        params: { actorId: 'user-1' },
        query: { unknown: 'value' },
      }),
    ).toThrow();
  });

  it('parses optional since as ISO date', () => {
    const result = listActorMessagesSchema.parse({
      params: { actorId: 'user-1' },
      query: { since: '2025-06-01T00:00:00Z' },
    });
    expect(result.query.since).toBeDefined();
    expect(result.query.since?.mode).toBe('time');
  });

  it('parses optional limit', () => {
    const result = listActorMessagesSchema.parse({
      params: { actorId: 'user-1' },
      query: { limit: '25' },
    });
    expect(result.query.limit).toBe(25);
  });

  it('treats empty string query values as undefined', () => {
    const result = listActorMessagesSchema.parse({
      params: { actorId: 'user-1' },
      query: { since: '', limit: '', workflowInstanceId: '' },
    });
    expect(result.query.since).toBeUndefined();
    expect(result.query.limit).toBeUndefined();
    expect(result.query.workflowInstanceId).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  listMessagesSchema                                                 */
/* ------------------------------------------------------------------ */

describe('listMessagesSchema', () => {
  it('accepts optional actorId in query', () => {
    const result = listMessagesSchema.parse({
      params: {},
      query: { actorId: 'user-1' },
    });
    expect(result.query.actorId).toBe('user-1');
  });

  it('parses with no query params', () => {
    const result = listMessagesSchema.parse({ params: {}, query: {} });
    expect(result.query.actorId).toBeUndefined();
  });

  it('rejects unknown query params (strict)', () => {
    expect(() =>
      listMessagesSchema.parse({
        params: {},
        query: { badParam: 'x' },
      }),
    ).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  mapMessageRowToResponse                                            */
/* ------------------------------------------------------------------ */

describe('mapMessageRowToResponse', () => {
  it('maps a DB row to the expected response shape', () => {
    const row = makeMessageRow();
    const result = mapMessageRowToResponse(row as any);
    expect(result).toEqual({
      id: row.id,
      title: row.title,
      body: row.body,
      actorId: row.actorId,
      actorType: row.actorType,
      workflowInstanceId: row.workflowInstanceId,
      workflowId: row.workflowId,
      projectId: row.projectId,
      status: row.status,
      metadata: row.metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  });
});
