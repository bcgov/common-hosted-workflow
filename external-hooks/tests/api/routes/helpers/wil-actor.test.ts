/**
 * Unit tests for `src/api/routes/helpers/wil-actor.ts`.
 */
import { describe, expect, it } from 'vitest';
import { resolveActorMatchers } from '../../../../src/api/routes/helpers/wil-actor';
import type { UiResolvedSession } from '../../../../src/api/helpers/ui-oidc';

const TENANT_ID = '717626be-f59f-4e35-ac87-f84c4e11b865';
const OTHER_TENANT_ID = 'e8d27b42-ef5b-4d14-b6ee-8f592ec4df9a';

function makeSession(overrides: Partial<UiResolvedSession> = {}): UiResolvedSession {
  return {
    subject: 'sub-abc-123',
    email: 'user@example.com',
    preferredUsername: 'user',
    name: 'Test User',
    issuer: 'https://issuer.example.com',
    audience: ['app'],
    claims: {},
    n8nUser: { id: 'n8n-1', email: 'user@example.com', disabled: false, role: null },
    permissions: { canManageWorkflows: true, canManageUsers: false, canManageProjects: false },
    tenantRoles: [
      { tenantId: TENANT_ID, tenantName: 'SDG', roles: ['project:editor', 'ui:actor'] },
      { tenantId: OTHER_TENANT_ID, tenantName: 'DEVX', roles: ['project:viewer'] },
    ],
    tenantGroups: [
      { tenantId: TENANT_ID, tenantName: 'SDG', groups: ['UI Actor', 'Admins'] },
      { tenantId: OTHER_TENANT_ID, tenantName: 'DEVX', groups: [] },
    ],
    ...overrides,
  } as UiResolvedSession;
}

describe('resolveActorMatchers', () => {
  it('returns session email as userId', () => {
    const session = makeSession({ email: 'alice@corp.io' });
    const result = resolveActorMatchers(session, TENANT_ID);

    expect(result.userId).toBe('alice@corp.io');
  });

  it('returns session subject as userFallback', () => {
    const session = makeSession({ subject: 'oidc-sub-xyz' });
    const result = resolveActorMatchers(session, TENANT_ID);

    expect(result.userFallback).toBe('oidc-sub-xyz');
  });

  it('returns role names from the matching tenant', () => {
    const session = makeSession();
    const result = resolveActorMatchers(session, TENANT_ID);

    expect(result.roleNames).toEqual(['project:editor', 'ui:actor']);
  });

  it('returns group names from the matching tenant', () => {
    const session = makeSession();
    const result = resolveActorMatchers(session, TENANT_ID);

    expect(result.groupNames).toEqual(['UI Actor', 'Admins']);
  });

  it('returns empty roleNames when tenant has no matching entry', () => {
    const session = makeSession({ tenantRoles: [] });
    const result = resolveActorMatchers(session, TENANT_ID);

    expect(result.roleNames).toEqual([]);
  });

  it('returns empty groupNames when tenant has no matching entry', () => {
    const session = makeSession({ tenantGroups: [] });
    const result = resolveActorMatchers(session, TENANT_ID);

    expect(result.groupNames).toEqual([]);
  });

  it('filters roles and groups by the provided tenantId', () => {
    const session = makeSession();
    const result = resolveActorMatchers(session, OTHER_TENANT_ID);

    expect(result.roleNames).toEqual(['project:viewer']);
    expect(result.groupNames).toEqual([]);
  });
});
