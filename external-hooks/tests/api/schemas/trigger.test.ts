import { describe, expect, it } from 'vitest';
import {
  createTriggerSchema,
  updateTriggerSchema,
  listTriggersSchema,
  callbackTriggerSchema,
  mapTriggerRowToResponse,
} from '../../../src/api/schemas/trigger';
import { makeWorkflowTriggerRow } from '../../helpers/mocks';

/* ------------------------------------------------------------------ */
/*  createTriggerSchema                                                 */
/* ------------------------------------------------------------------ */

describe('createTriggerSchema', () => {
  const validBody = {
    triggerType: 'button',
    targetKind: 'n8n-node',
    targetWorkflowId: 'wf1',
    targetNodeId: 'node1',
    metadata: { buttonText: 'Run' },
    allowedActorsType: 'user',
    allowedActors: ['user@example.com'],
  };

  it('accepts a valid button trigger body', () => {
    const result = createTriggerSchema.parse({ body: validBody });
    expect(result.body.triggerType).toBe('button');
    expect(result.body.authEnabled).toBe(false);
  });

  it('accepts a valid chefs-form trigger body', () => {
    const result = createTriggerSchema.parse({
      body: { ...validBody, triggerType: 'chefs-form', metadata: { formId: 'form-1', formName: 'My Form' } },
    });
    expect(result.body.triggerType).toBe('chefs-form');
  });

  it('defaults authEnabled to false when omitted', () => {
    const result = createTriggerSchema.parse({ body: validBody });
    expect(result.body.authEnabled).toBe(false);
  });

  it('accepts authEnabled: true', () => {
    const result = createTriggerSchema.parse({ body: { ...validBody, authEnabled: true } });
    expect(result.body.authEnabled).toBe(true);
  });

  it('rejects invalid triggerType', () => {
    expect(() => createTriggerSchema.parse({ body: { ...validBody, triggerType: 'unknown' } })).toThrow();
  });

  it('rejects invalid allowedActorsType', () => {
    expect(() => createTriggerSchema.parse({ body: { ...validBody, allowedActorsType: 'admin' } })).toThrow();
  });

  it('accepts createdBy as optional field', () => {
    const result = createTriggerSchema.parse({ body: { ...validBody, createdBy: 'admin@example.com' } });
    expect(result.body.createdBy).toBe('admin@example.com');
  });

  it('rejects unknown body fields (strict)', () => {
    expect(() => createTriggerSchema.parse({ body: { ...validBody, unknownField: 'x' } })).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => createTriggerSchema.parse({ body: {} })).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  updateTriggerSchema                                                 */
/* ------------------------------------------------------------------ */

describe('updateTriggerSchema', () => {
  const validParams = { triggerId: 'trigger-001' };
  const validBody = {
    targetKind: 'n8n-node',
    targetWorkflowId: 'wf1',
    targetNodeId: 'node1',
    metadata: { buttonText: 'Run' },
    allowedActorsType: 'user',
    allowedActors: ['user@example.com'],
  };

  it('accepts valid update body with params', () => {
    const result = updateTriggerSchema.parse({ params: validParams, body: validBody });
    expect(result.params.triggerId).toBe('trigger-001');
    expect(result.body.targetWorkflowId).toBe('wf1');
  });

  it('rejects empty triggerId', () => {
    expect(() => updateTriggerSchema.parse({ params: { triggerId: '' }, body: validBody })).toThrow();
  });

  it('rejects unknown body fields (strict)', () => {
    expect(() => updateTriggerSchema.parse({ params: validParams, body: { ...validBody, extra: true } })).toThrow();
  });

  it('defaults authEnabled to false when omitted', () => {
    const result = updateTriggerSchema.parse({ params: validParams, body: validBody });
    expect(result.body.authEnabled).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  listTriggersSchema                                                  */
/* ------------------------------------------------------------------ */

describe('listTriggersSchema', () => {
  it('accepts empty request', () => {
    const result = listTriggersSchema.parse({});
    expect(result).toBeDefined();
  });

  it('accepts request with optional query and body', () => {
    const result = listTriggersSchema.parse({ query: { page: '1' }, body: {} });
    expect(result).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  callbackTriggerSchema                                               */
/* ------------------------------------------------------------------ */

describe('callbackTriggerSchema', () => {
  it('accepts valid triggerId in params', () => {
    const result = callbackTriggerSchema.parse({ params: { triggerId: 'trigger-001' } });
    expect(result.params.triggerId).toBe('trigger-001');
  });

  it('rejects empty triggerId', () => {
    expect(() => callbackTriggerSchema.parse({ params: { triggerId: '' } })).toThrow();
  });

  it('accepts optional body', () => {
    const result = callbackTriggerSchema.parse({
      params: { triggerId: 'trigger-001' },
      body: { formData: 'yes' },
    });
    expect(result.params.triggerId).toBe('trigger-001');
  });
});

/* ------------------------------------------------------------------ */
/*  mapTriggerRowToResponse                                             */
/* ------------------------------------------------------------------ */

describe('mapTriggerRowToResponse', () => {
  it('maps a button trigger row to the expected response shape', () => {
    const row = makeWorkflowTriggerRow();
    const result = mapTriggerRowToResponse(row as any);
    expect(result.id).toBe(row.id);
    expect(result.triggerType).toBe('button');
    expect(result.targetKind).toBe('n8n-node');
    expect(result.allowedActors).toEqual(row.allowedActors);
    expect(result.authEnabled).toBe(false);
    expect(result.createdBy).toBe('creator@example.com');
    expect(result.updatedBy).toBeNull();
  });

  it('never exposes an apiKey for a chefs-form row', () => {
    const row = makeWorkflowTriggerRow({
      triggerType: 'chefs-form',
      metadata: { formId: 'form-1', formName: 'My Form' },
    });
    const result = mapTriggerRowToResponse(row as any);
    expect(result.triggerType).toBe('chefs-form');
    expect(result.metadata.apiKey).toBeUndefined();
  });

  it('strips raw apiKey from metadata if it slipped through', () => {
    const row = makeWorkflowTriggerRow({
      triggerType: 'chefs-form',
      metadata: { formId: 'form-1', apiKey: 'raw-api-key' }, // pragma: allowlist secret
    });
    const result = mapTriggerRowToResponse(row as any);
    expect(result.metadata.apiKey).toBeUndefined();
  });

  it('maps null createdBy/updatedBy correctly', () => {
    const row = makeWorkflowTriggerRow({ createdBy: null, updatedBy: null });
    const result = mapTriggerRowToResponse(row as any);
    expect(result.createdBy).toBeNull();
    expect(result.updatedBy).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  n8n-node targets                                                    */
/* ------------------------------------------------------------------ */

describe('trigger target kinds', () => {
  const common = {
    metadata: { buttonText: 'Run' },
    allowedActorsType: 'all',
    allowedActors: ['*'],
  };

  it('defaults a body without targetKind to the n8n-node variant', () => {
    const { body } = createTriggerSchema.parse({
      body: { ...common, triggerType: 'button', targetWorkflowId: 'wf1', targetNodeId: 'n1' },
    });
    expect(body.targetKind).toBe('n8n-node');
  });

  it('accepts an n8n-node target', () => {
    const { body } = createTriggerSchema.parse({
      body: { ...common, triggerType: 'button', targetKind: 'n8n-node', targetWorkflowId: 'wf1', targetNodeId: 'n1' },
    });
    expect(body).toMatchObject({ targetKind: 'n8n-node', targetWorkflowId: 'wf1', targetNodeId: 'n1' });
  });

  it('rejects an n8n-node target missing the node id', () => {
    expect(() =>
      createTriggerSchema.parse({
        body: { ...common, triggerType: 'button', targetKind: 'n8n-node', targetWorkflowId: 'wf1' },
      }),
    ).toThrow();
  });

  it('rejects an unsupported target kind', () => {
    expect(() =>
      createTriggerSchema.parse({
        body: {
          ...common,
          triggerType: 'button',
          targetKind: 'url',
          triggerUrl: 'https://example.com/hook',
          triggerMethod: 'POST',
        },
      }),
    ).toThrow();
  });

  it('maps target columns and status onto the response', () => {
    const row = makeWorkflowTriggerRow({
      targetKind: 'n8n-node',
      targetWorkflowId: 'wf1',
      targetNodeId: 'n1',
    });
    const result = mapTriggerRowToResponse(row as any, 'live');
    expect(result).toMatchObject({
      targetKind: 'n8n-node',
      targetWorkflowId: 'wf1',
      targetStatus: 'live',
    });
  });
});
