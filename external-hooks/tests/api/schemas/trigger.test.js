"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const trigger_1 = require("../../../src/api/schemas/trigger");
const mocks_1 = require("../../helpers/mocks");
/* ------------------------------------------------------------------ */
/*  createTriggerSchema                                                 */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('createTriggerSchema', () => {
    const validBody = {
        triggerType: 'button',
        targetKind: 'n8n-node',
        targetWorkflowId: 'wf1',
        targetNodeId: 'node1',
        metadata: { buttonText: 'Run' },
        allowedActorsType: 'user',
        allowedActors: ['user@example.com'],
    };
    (0, vitest_1.it)('accepts a valid button trigger body', () => {
        const result = trigger_1.createTriggerSchema.parse({ body: validBody });
        (0, vitest_1.expect)(result.body.triggerType).toBe('button');
        (0, vitest_1.expect)(result.body.authEnabled).toBe(false);
    });
    (0, vitest_1.it)('accepts a valid chefs-form trigger body', () => {
        const result = trigger_1.createTriggerSchema.parse({
            body: { ...validBody, triggerType: 'chefs-form', metadata: { formId: 'form-1', formName: 'My Form' } },
        });
        (0, vitest_1.expect)(result.body.triggerType).toBe('chefs-form');
    });
    (0, vitest_1.it)('defaults authEnabled to false when omitted', () => {
        const result = trigger_1.createTriggerSchema.parse({ body: validBody });
        (0, vitest_1.expect)(result.body.authEnabled).toBe(false);
    });
    (0, vitest_1.it)('accepts authEnabled: true', () => {
        const result = trigger_1.createTriggerSchema.parse({ body: { ...validBody, authEnabled: true } });
        (0, vitest_1.expect)(result.body.authEnabled).toBe(true);
    });
    (0, vitest_1.it)('rejects invalid triggerType', () => {
        (0, vitest_1.expect)(() => trigger_1.createTriggerSchema.parse({ body: { ...validBody, triggerType: 'unknown' } })).toThrow();
    });
    (0, vitest_1.it)('rejects invalid allowedActorsType', () => {
        (0, vitest_1.expect)(() => trigger_1.createTriggerSchema.parse({ body: { ...validBody, allowedActorsType: 'admin' } })).toThrow();
    });
    (0, vitest_1.it)("rejects '*' unless allowedActorsType is 'all'", () => {
        (0, vitest_1.expect)(() => trigger_1.createTriggerSchema.parse({
            body: { ...validBody, allowedActorsType: 'role', allowedActors: ['approver', '*'] },
        })).toThrow(/can only be used when allowedActorsType is 'all'/);
    });
    (0, vitest_1.it)("accepts '*' when allowedActorsType is 'all'", () => {
        const result = trigger_1.createTriggerSchema.parse({
            body: { ...validBody, allowedActorsType: 'all', allowedActors: ['*'] },
        });
        (0, vitest_1.expect)(result.body.allowedActors).toEqual(['*']);
    });
    (0, vitest_1.it)('accepts createdBy as optional field', () => {
        const result = trigger_1.createTriggerSchema.parse({ body: { ...validBody, createdBy: 'admin@example.com' } });
        (0, vitest_1.expect)(result.body.createdBy).toBe('admin@example.com');
    });
    (0, vitest_1.it)('rejects unknown body fields (strict)', () => {
        (0, vitest_1.expect)(() => trigger_1.createTriggerSchema.parse({ body: { ...validBody, unknownField: 'x' } })).toThrow();
    });
    (0, vitest_1.it)('rejects missing required fields', () => {
        (0, vitest_1.expect)(() => trigger_1.createTriggerSchema.parse({ body: {} })).toThrow();
    });
});
/* ------------------------------------------------------------------ */
/*  updateTriggerSchema                                                 */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('updateTriggerSchema', () => {
    const validParams = { triggerId: 'trigger-001' };
    const validBody = {
        targetKind: 'n8n-node',
        targetWorkflowId: 'wf1',
        targetNodeId: 'node1',
        metadata: { buttonText: 'Run' },
        allowedActorsType: 'user',
        allowedActors: ['user@example.com'],
    };
    (0, vitest_1.it)('accepts valid update body with params', () => {
        const result = trigger_1.updateTriggerSchema.parse({ params: validParams, body: validBody });
        (0, vitest_1.expect)(result.params.triggerId).toBe('trigger-001');
        (0, vitest_1.expect)(result.body.targetWorkflowId).toBe('wf1');
    });
    (0, vitest_1.it)('rejects empty triggerId', () => {
        (0, vitest_1.expect)(() => trigger_1.updateTriggerSchema.parse({ params: { triggerId: '' }, body: validBody })).toThrow();
    });
    (0, vitest_1.it)('rejects unknown body fields (strict)', () => {
        (0, vitest_1.expect)(() => trigger_1.updateTriggerSchema.parse({ params: validParams, body: { ...validBody, extra: true } })).toThrow();
    });
    (0, vitest_1.it)('defaults authEnabled to false when omitted', () => {
        const result = trigger_1.updateTriggerSchema.parse({ params: validParams, body: validBody });
        (0, vitest_1.expect)(result.body.authEnabled).toBe(false);
    });
});
/* ------------------------------------------------------------------ */
/*  listTriggersSchema                                                  */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('listTriggersSchema', () => {
    (0, vitest_1.it)('accepts empty request', () => {
        const result = trigger_1.listTriggersSchema.parse({});
        (0, vitest_1.expect)(result).toBeDefined();
    });
    (0, vitest_1.it)('accepts request with optional query and body', () => {
        const result = trigger_1.listTriggersSchema.parse({ query: { page: '1' }, body: {} });
        (0, vitest_1.expect)(result).toBeDefined();
    });
});
/* ------------------------------------------------------------------ */
/*  callbackTriggerSchema                                               */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('callbackTriggerSchema', () => {
    (0, vitest_1.it)('accepts valid triggerId in params', () => {
        const result = trigger_1.callbackTriggerSchema.parse({ params: { triggerId: 'trigger-001' } });
        (0, vitest_1.expect)(result.params.triggerId).toBe('trigger-001');
    });
    (0, vitest_1.it)('rejects empty triggerId', () => {
        (0, vitest_1.expect)(() => trigger_1.callbackTriggerSchema.parse({ params: { triggerId: '' } })).toThrow();
    });
    (0, vitest_1.it)('accepts optional body', () => {
        const result = trigger_1.callbackTriggerSchema.parse({
            params: { triggerId: 'trigger-001' },
            body: { formData: 'yes' },
        });
        (0, vitest_1.expect)(result.params.triggerId).toBe('trigger-001');
    });
});
/* ------------------------------------------------------------------ */
/*  mapTriggerRowToResponse                                             */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('mapTriggerRowToResponse', () => {
    (0, vitest_1.it)('maps a button trigger row to the expected response shape', () => {
        const row = (0, mocks_1.makeWorkflowTriggerRow)();
        const result = (0, trigger_1.mapTriggerRowToResponse)(row);
        (0, vitest_1.expect)(result.id).toBe(row.id);
        (0, vitest_1.expect)(result.triggerType).toBe('button');
        (0, vitest_1.expect)(result.targetKind).toBe('n8n-node');
        (0, vitest_1.expect)(result.allowedActors).toEqual(row.allowedActors);
        (0, vitest_1.expect)(result.authEnabled).toBe(false);
        (0, vitest_1.expect)(result.createdBy).toBe('creator@example.com');
        (0, vitest_1.expect)(result.updatedBy).toBeNull();
    });
    (0, vitest_1.it)('never exposes an apiKey for a chefs-form row', () => {
        const row = (0, mocks_1.makeWorkflowTriggerRow)({
            triggerType: 'chefs-form',
            metadata: { formId: 'form-1', formName: 'My Form' },
        });
        const result = (0, trigger_1.mapTriggerRowToResponse)(row);
        (0, vitest_1.expect)(result.triggerType).toBe('chefs-form');
        (0, vitest_1.expect)(result.metadata.apiKey).toBeUndefined();
    });
    (0, vitest_1.it)('strips raw apiKey from metadata if it slipped through', () => {
        const row = (0, mocks_1.makeWorkflowTriggerRow)({
            triggerType: 'chefs-form',
            metadata: { formId: 'form-1', apiKey: 'raw-api-key' }, // pragma: allowlist secret
        });
        const result = (0, trigger_1.mapTriggerRowToResponse)(row);
        (0, vitest_1.expect)(result.metadata.apiKey).toBeUndefined();
    });
    (0, vitest_1.it)('maps null createdBy/updatedBy correctly', () => {
        const row = (0, mocks_1.makeWorkflowTriggerRow)({ createdBy: null, updatedBy: null });
        const result = (0, trigger_1.mapTriggerRowToResponse)(row);
        (0, vitest_1.expect)(result.createdBy).toBeNull();
        (0, vitest_1.expect)(result.updatedBy).toBeNull();
    });
});
/* ------------------------------------------------------------------ */
/*  n8n-node targets                                                    */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('trigger target kinds', () => {
    const common = {
        metadata: { buttonText: 'Run' },
        allowedActorsType: 'all',
        allowedActors: ['*'],
    };
    (0, vitest_1.it)('defaults a body without targetKind to the n8n-node variant', () => {
        const { body } = trigger_1.createTriggerSchema.parse({
            body: { ...common, triggerType: 'button', targetWorkflowId: 'wf1', targetNodeId: 'n1' },
        });
        (0, vitest_1.expect)(body.targetKind).toBe('n8n-node');
    });
    (0, vitest_1.it)('accepts an n8n-node target', () => {
        const { body } = trigger_1.createTriggerSchema.parse({
            body: { ...common, triggerType: 'button', targetKind: 'n8n-node', targetWorkflowId: 'wf1', targetNodeId: 'n1' },
        });
        (0, vitest_1.expect)(body).toMatchObject({ targetKind: 'n8n-node', targetWorkflowId: 'wf1', targetNodeId: 'n1' });
    });
    (0, vitest_1.it)('rejects an n8n-node target missing the node id', () => {
        (0, vitest_1.expect)(() => trigger_1.createTriggerSchema.parse({
            body: { ...common, triggerType: 'button', targetKind: 'n8n-node', targetWorkflowId: 'wf1' },
        })).toThrow();
    });
    (0, vitest_1.it)('rejects an unsupported target kind', () => {
        (0, vitest_1.expect)(() => trigger_1.createTriggerSchema.parse({
            body: {
                ...common,
                triggerType: 'button',
                targetKind: 'url',
                triggerUrl: 'https://example.com/hook',
                triggerMethod: 'POST',
            },
        })).toThrow();
    });
    (0, vitest_1.it)('maps target columns and status onto the response', () => {
        const row = (0, mocks_1.makeWorkflowTriggerRow)({
            targetKind: 'n8n-node',
            targetWorkflowId: 'wf1',
            targetNodeId: 'n1',
        });
        const result = (0, trigger_1.mapTriggerRowToResponse)(row, 'live');
        (0, vitest_1.expect)(result).toMatchObject({
            targetKind: 'n8n-node',
            targetWorkflowId: 'wf1',
            targetStatus: 'live',
        });
    });
});
