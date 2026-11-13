'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
/**
 * Unit tests for `src/api/routes/helpers/wil-actor.ts`.
 */
const vitest_1 = require('vitest');
const wil_actor_1 = require('../../../../src/api/routes/helpers/wil-actor');
const TENANT_ID = '717626be-f59f-4e35-ac87-f84c4e11b865';
const OTHER_TENANT_ID = 'e8d27b42-ef5b-4d14-b6ee-8f592ec4df9a';
function makeSession(overrides = {}) {
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
  };
}
(0, vitest_1.describe)('resolveActorMatchers', () => {
  (0, vitest_1.it)('returns session email as userId', () => {
    const session = makeSession({ email: 'alice@corp.io' });
    const result = (0, wil_actor_1.resolveActorMatchers)(session, TENANT_ID);
    (0, vitest_1.expect)(result.userId).toBe('alice@corp.io');
  });
  (0, vitest_1.it)('returns session subject as userFallback', () => {
    const session = makeSession({ subject: 'oidc-sub-xyz' });
    const result = (0, wil_actor_1.resolveActorMatchers)(session, TENANT_ID);
    (0, vitest_1.expect)(result.userFallback).toBe('oidc-sub-xyz');
  });
  (0, vitest_1.it)('returns role names from the matching tenant', () => {
    const session = makeSession();
    const result = (0, wil_actor_1.resolveActorMatchers)(session, TENANT_ID);
    (0, vitest_1.expect)(result.roleNames).toEqual(['project:editor', 'ui:actor']);
  });
  (0, vitest_1.it)('returns group names from the matching tenant', () => {
    const session = makeSession();
    const result = (0, wil_actor_1.resolveActorMatchers)(session, TENANT_ID);
    (0, vitest_1.expect)(result.groupNames).toEqual(['UI Actor', 'Admins']);
  });
  (0, vitest_1.it)('returns empty roleNames when tenant has no matching entry', () => {
    const session = makeSession({ tenantRoles: [] });
    const result = (0, wil_actor_1.resolveActorMatchers)(session, TENANT_ID);
    (0, vitest_1.expect)(result.roleNames).toEqual([]);
  });
  (0, vitest_1.it)('returns empty groupNames when tenant has no matching entry', () => {
    const session = makeSession({ tenantGroups: [] });
    const result = (0, wil_actor_1.resolveActorMatchers)(session, TENANT_ID);
    (0, vitest_1.expect)(result.groupNames).toEqual([]);
  });
  (0, vitest_1.it)('filters roles and groups by the provided tenantId', () => {
    const session = makeSession();
    const result = (0, wil_actor_1.resolveActorMatchers)(session, OTHER_TENANT_ID);
    (0, vitest_1.expect)(result.roleNames).toEqual(['project:viewer']);
    (0, vitest_1.expect)(result.groupNames).toEqual([]);
  });
});
