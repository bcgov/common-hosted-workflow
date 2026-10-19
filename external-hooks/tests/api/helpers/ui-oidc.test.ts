import { describe, expect, it, vi } from 'vitest';

vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/config')>();
  return { ...original, IS_GOLDDR: true };
});

import { buildSessionSummary, type UiResolvedSession } from '../../../src/api/helpers/ui-oidc';

const resolvedSession = {
  subject: 'sub-1',
  email: 'person@example.com',
  issuer: 'https://issuer.example.com',
  audience: ['app'],
  claims: {},
  n8nUser: null,
  permissions: {
    isAdmin: false,
    canViewWorkflows: false,
    canRequestAccess: true,
    canReviewAccessRequests: false,
    canShareWorkflows: false,
    canUnshareWorkflows: false,
    canManageWil: false,
    canManageProject: false,
  },
  tenantRoles: [],
  tenantGroups: [],
} as UiResolvedSession;

describe('buildSessionSummary on GoldDR', () => {
  it('reports goldDr for an authenticated session', () => {
    expect(buildSessionSummary(resolvedSession).goldDr).toBe(true);
  });

  it('reports goldDr for an anonymous session', () => {
    expect(buildSessionSummary(null).goldDr).toBe(true);
  });
});
