"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const message_1 = require("../../../src/api/schemas/message");
const mocks_1 = require("../../helpers/mocks");
/* ------------------------------------------------------------------ */
/*  createMessageSchema                                                */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('createMessageSchema', () => {
    const validBody = {
        title: 'Alert',
        body: 'Something happened',
        actorId: 'user-1',
        actorType: 'user',
        workflowInstanceId: 'exec-1',
        workflowId: 'wf-1',
    };
    (0, vitest_1.it)('accepts a valid body with required fields', () => {
        const result = message_1.createMessageSchema.parse({ body: validBody });
        (0, vitest_1.expect)(result.body.title).toBe('Alert');
        (0, vitest_1.expect)(result.body.actorType).toBe('user');
    });
    (0, vitest_1.it)('lowercases actorType', () => {
        const result = message_1.createMessageSchema.parse({ body: { ...validBody, actorType: 'USER' } });
        (0, vitest_1.expect)(result.body.actorType).toBe('user');
    });
    (0, vitest_1.it)('lowercases status', () => {
        const result = message_1.createMessageSchema.parse({ body: { ...validBody, status: 'READ' } });
        (0, vitest_1.expect)(result.body.status).toBe('read');
    });
    (0, vitest_1.it)('accepts optional metadata as object', () => {
        const result = message_1.createMessageSchema.parse({ body: { ...validBody, metadata: { key: 'val' } } });
        (0, vitest_1.expect)(result.body.metadata).toEqual({ key: 'val' });
    });
    (0, vitest_1.it)('accepts null metadata', () => {
        const result = message_1.createMessageSchema.parse({ body: { ...validBody, metadata: null } });
        (0, vitest_1.expect)(result.body.metadata).toBeNull();
    });
    (0, vitest_1.it)('rejects missing title', () => {
        const { title, ...noTitle } = validBody;
        (0, vitest_1.expect)(() => message_1.createMessageSchema.parse({ body: noTitle })).toThrow();
    });
    (0, vitest_1.it)('rejects empty body field', () => {
        (0, vitest_1.expect)(() => message_1.createMessageSchema.parse({ body: { ...validBody, body: '' } })).toThrow();
    });
    (0, vitest_1.it)('rejects invalid actorType', () => {
        (0, vitest_1.expect)(() => message_1.createMessageSchema.parse({ body: { ...validBody, actorType: 'invalid' } })).toThrow();
    });
    (0, vitest_1.it)('rejects invalid status', () => {
        (0, vitest_1.expect)(() => message_1.createMessageSchema.parse({ body: { ...validBody, status: 'deleted' } })).toThrow();
    });
    (0, vitest_1.it)('accepts all valid actorType values', () => {
        for (const actorType of ['user', 'role', 'group', 'system', 'other']) {
            const result = message_1.createMessageSchema.parse({ body: { ...validBody, actorType } });
            (0, vitest_1.expect)(result.body.actorType).toBe(actorType);
        }
    });
});
/* ------------------------------------------------------------------ */
/*  listActorMessagesSchema                                            */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('listActorMessagesSchema', () => {
    (0, vitest_1.it)('parses valid params and empty query', () => {
        const result = message_1.listActorMessagesSchema.parse({
            params: { actorId: 'user-1' },
            query: {},
        });
        (0, vitest_1.expect)(result.params.actorId).toBe('user-1');
    });
    (0, vitest_1.it)('rejects empty actorId', () => {
        (0, vitest_1.expect)(() => message_1.listActorMessagesSchema.parse({
            params: { actorId: '' },
            query: {},
        })).toThrow();
    });
    (0, vitest_1.it)('rejects unknown query params (strict)', () => {
        (0, vitest_1.expect)(() => message_1.listActorMessagesSchema.parse({
            params: { actorId: 'user-1' },
            query: { unknown: 'value' },
        })).toThrow();
    });
    (0, vitest_1.it)('parses optional since as ISO date', () => {
        const result = message_1.listActorMessagesSchema.parse({
            params: { actorId: 'user-1' },
            query: { since: '2025-06-01T00:00:00Z' },
        });
        (0, vitest_1.expect)(result.query.since).toBeDefined();
        (0, vitest_1.expect)(result.query.since?.mode).toBe('time');
    });
    (0, vitest_1.it)('parses optional limit', () => {
        const result = message_1.listActorMessagesSchema.parse({
            params: { actorId: 'user-1' },
            query: { limit: '25' },
        });
        (0, vitest_1.expect)(result.query.limit).toBe(25);
    });
    (0, vitest_1.it)('treats empty string query values as undefined', () => {
        const result = message_1.listActorMessagesSchema.parse({
            params: { actorId: 'user-1' },
            query: { since: '', limit: '', workflowInstanceId: '' },
        });
        (0, vitest_1.expect)(result.query.since).toBeUndefined();
        (0, vitest_1.expect)(result.query.limit).toBeUndefined();
        (0, vitest_1.expect)(result.query.workflowInstanceId).toBeUndefined();
    });
});
/* ------------------------------------------------------------------ */
/*  listMessagesSchema                                                 */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('listMessagesSchema', () => {
    (0, vitest_1.it)('accepts optional actorId in query', () => {
        const result = message_1.listMessagesSchema.parse({
            params: {},
            query: { actorId: 'user-1' },
        });
        (0, vitest_1.expect)(result.query.actorId).toBe('user-1');
    });
    (0, vitest_1.it)('parses with no query params', () => {
        const result = message_1.listMessagesSchema.parse({ params: {}, query: {} });
        (0, vitest_1.expect)(result.query.actorId).toBeUndefined();
    });
    (0, vitest_1.it)('rejects unknown query params (strict)', () => {
        (0, vitest_1.expect)(() => message_1.listMessagesSchema.parse({
            params: {},
            query: { badParam: 'x' },
        })).toThrow();
    });
});
/* ------------------------------------------------------------------ */
/*  mapMessageRowToResponse                                            */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('mapMessageRowToResponse', () => {
    (0, vitest_1.it)('maps a DB row to the expected response shape', () => {
        const row = (0, mocks_1.makeMessageRow)();
        const result = (0, message_1.mapMessageRowToResponse)(row);
        (0, vitest_1.expect)(result).toEqual({
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
