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
    triggerUrl: 'https://example.com/webhook',
    triggerMethod: 'POST',
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

  it('rejects invalid triggerUrl (not a URL)', () => {
    expect(() => createTriggerSchema.parse({ body: { ...validBody, triggerUrl: 'not-a-url' } })).toThrow();
  });

  it('rejects invalid triggerMethod', () => {
    expect(() => createTriggerSchema.parse({ body: { ...validBody, triggerMethod: 'DELETE' } })).toThrow();
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
    triggerUrl: 'https://example.com/webhook',
    triggerMethod: 'POST',
    metadata: { buttonText: 'Run' },
    allowedActorsType: 'user',
    allowedActors: ['user@example.com'],
  };

  it('accepts valid update body with params', () => {
    const result = updateTriggerSchema.parse({ params: validParams, body: validBody });
    expect(result.params.triggerId).toBe('trigger-001');
    expect(result.body.triggerUrl).toBe('https://example.com/webhook');
  });

  it('rejects empty triggerId', () => {
    expect(() => updateTriggerSchema.parse({ params: { triggerId: '' }, body: validBody })).toThrow();
  });

  it('rejects invalid triggerUrl', () => {
    expect(() =>
      updateTriggerSchema.parse({ params: validParams, body: { ...validBody, triggerUrl: 'bad' } }),
    ).toThrow();
  });

  it('rejects unknown body fields (strict)', () => {
    expect(() => updateTriggerSchema.parse({ params: validParams, body: { ...validBody, extra: true } })).toThrow();
  });

  it('defaults authEnabled to false when omitted', () => {
    const result = updateTriggerSchema.parse({ params: validParams, body: validBody });
    expect(result.body.authEnabled).toBe(false);
  });

  it('accepts GET triggerMethod', () => {
    const result = updateTriggerSchema.parse({ params: validParams, body: { ...validBody, triggerMethod: 'GET' } });
    expect(result.body.triggerMethod).toBe('GET');
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
    expect(result.triggerUrl).toBe(row.triggerUrl);
    expect(result.allowedActors).toEqual(row.allowedActors);
    expect(result.authEnabled).toBe(false);
    expect(result.createdBy).toBe('creator@example.com');
    expect(result.updatedBy).toBeNull();
  });

  it('maps a chefs-form row and sets apiKey placeholder when hasCredential is true', () => {
    const row = makeWorkflowTriggerRow({
      triggerType: 'chefs-form',
      metadata: { formId: 'form-1', formName: 'My Form' },
    });
    const result = mapTriggerRowToResponse(row as any, true);
    expect(result.triggerType).toBe('chefs-form');
    expect(result.metadata.apiKey).toBeTruthy();
  });

  it('does not set apiKey placeholder for chefs-form when hasCredential is false', () => {
    const row = makeWorkflowTriggerRow({
      triggerType: 'chefs-form',
      metadata: { formId: 'form-1', formName: 'My Form' },
    });
    const result = mapTriggerRowToResponse(row as any, false);
    expect(result.metadata.apiKey).toBeUndefined();
  });

  it('strips raw apiKey from metadata if it slipped through', () => {
    const row = makeWorkflowTriggerRow({
      triggerType: 'chefs-form',
      metadata: { formId: 'form-1', apiKey: 'raw-api-key' }, // pragma: allowlist secret
    });
    const result = mapTriggerRowToResponse(row as any, false);
    expect(result.metadata.apiKey).toBeUndefined();
  });

  it('does not add apiKey placeholder for button triggers even if hasCredential is true', () => {
    const row = makeWorkflowTriggerRow({ triggerType: 'button' });
    const result = mapTriggerRowToResponse(row as any, true);
    expect(result.metadata.apiKey).toBeUndefined();
  });

  it('maps null createdBy/updatedBy correctly', () => {
    const row = makeWorkflowTriggerRow({ createdBy: null, updatedBy: null });
    const result = mapTriggerRowToResponse(row as any);
    expect(result.createdBy).toBeNull();
    expect(result.updatedBy).toBeNull();
  });
});
