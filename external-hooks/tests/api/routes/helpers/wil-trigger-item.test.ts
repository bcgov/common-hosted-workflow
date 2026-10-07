import { describe, expect, it } from 'vitest';
import { buildWilTriggerItem, resolveTriggerInput } from '../../../../src/api/routes/helpers/wil-trigger-item';

const session = {
  email: 'actor@example.com',
  tenantRoles: [{ tenantId: 't1', roles: ['viewer'] }],
  tenantGroups: [{ tenantId: 't1', groups: ['g1'] }],
} as any;

const button = (metadata: Record<string, unknown>) => ({ id: 'tr1', triggerType: 'button', metadata });

describe('resolveTriggerInput', () => {
  it('prefers configured button inputValues over the legacy postBody', () => {
    expect(resolveTriggerInput(button({ inputValues: { a: 1 }, postBody: '{"b":2}' }), {})).toEqual({ a: 1 });
  });

  it('falls back to the parsed postBody and tolerates invalid JSON', () => {
    expect(resolveTriggerInput(button({ postBody: '{"b":2}' }), {})).toEqual({ b: 2 });
    expect(resolveTriggerInput(button({ postBody: 'nope' }), {})).toEqual({});
  });

  it('uses the submitted body for CHEFS forms', () => {
    expect(resolveTriggerInput({ id: 'tr1', triggerType: 'chefs-form', metadata: {} }, { x: 1 })).toEqual({ x: 1 });
  });
});

describe('buildWilTriggerItem', () => {
  it('follows the node output contract', () => {
    const item = buildWilTriggerItem({
      trigger: button({ buttonText: 'Go' }),
      session,
      tenantId: 't1',
      requestBody: {},
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(item.json).toEqual({
      source: 'wil',
      trigger: { id: 'tr1', type: 'button', name: 'Go' },
      actor: { email: 'actor@example.com', tenantId: 't1', roles: ['viewer'], groups: ['g1'] },
      input: {},
      firedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns empty roles/groups for another tenant', () => {
    const item = buildWilTriggerItem({ trigger: button({}), session, tenantId: 'other', requestBody: {} });
    expect(item.json.actor).toMatchObject({ roles: [], groups: [] });
  });
});
