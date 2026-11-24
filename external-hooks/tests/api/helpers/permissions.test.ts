import { describe, expect, it, vi } from 'vitest';
import { computePermissions } from '../../../src/api/helpers/permissions';

function makeFeatureFlagService(enabled: string[] = ['workflow-share', 'wil', 'project']) {
  return {
    isFeatureEnabled: vi.fn((flag: string) => enabled.includes(flag)),
  } as any;
}

const memberRole = { slug: 'global:member' };
const adminRole = { slug: 'global:admin' };
const ownerRole = { slug: 'global:owner' };

describe('computePermissions', () => {
  it('grants only access-request capability to an unprovisioned identity (no n8n user)', () => {
    const permissions = computePermissions(null, makeFeatureFlagService());

    expect(permissions).toEqual({
      isAdmin: false,
      canViewWorkflows: false,
      canRequestAccess: true,
      canReviewAccessRequests: false,
      canShareWorkflows: false,
      canUnshareWorkflows: false,
      canManageWil: false,
      canManageProject: false,
    });
  });

  it('grants only access-request capability to an enabled user without a role', () => {
    const permissions = computePermissions({ disabled: false, role: null }, makeFeatureFlagService());

    expect(permissions).toEqual({
      isAdmin: false,
      canViewWorkflows: false,
      canRequestAccess: true,
      canReviewAccessRequests: false,
      canShareWorkflows: false,
      canUnshareWorkflows: false,
      canManageWil: false,
      canManageProject: false,
    });
  });

  it('denies every n8n-derived capability to a disabled admin retaining a stale role', () => {
    const permissions = computePermissions({ disabled: true, role: adminRole }, makeFeatureFlagService());

    expect(permissions).toEqual({
      isAdmin: false,
      canViewWorkflows: false,
      canRequestAccess: true,
      canReviewAccessRequests: false,
      canShareWorkflows: false,
      canUnshareWorkflows: false,
      canManageWil: false,
      canManageProject: false,
    });
  });

  it('denies admin capabilities to a disabled owner retaining a stale role', () => {
    const permissions = computePermissions({ disabled: true, role: ownerRole }, makeFeatureFlagService());

    expect(permissions.isAdmin).toBe(false);
    expect(permissions.canReviewAccessRequests).toBe(false);
    expect(permissions.canUnshareWorkflows).toBe(false);
    expect(permissions.canRequestAccess).toBe(true);
  });

  it('denies n8n-derived capabilities to a disabled member', () => {
    const permissions = computePermissions({ disabled: true, role: memberRole }, makeFeatureFlagService());

    expect(permissions.canViewWorkflows).toBe(false);
    expect(permissions.canShareWorkflows).toBe(false);
    expect(permissions.canManageWil).toBe(false);
    expect(permissions.canManageProject).toBe(false);
    expect(permissions.canRequestAccess).toBe(true);
  });

  it('retains member capabilities for an enabled, eligible member', () => {
    const permissions = computePermissions({ disabled: false, role: memberRole }, makeFeatureFlagService());

    expect(permissions).toEqual({
      isAdmin: false,
      canViewWorkflows: true,
      canRequestAccess: false,
      canReviewAccessRequests: false,
      canShareWorkflows: true,
      canUnshareWorkflows: false,
      canManageWil: true,
      canManageProject: true,
    });
  });

  it('retains admin capabilities for an enabled admin', () => {
    const permissions = computePermissions({ disabled: false, role: adminRole }, makeFeatureFlagService());

    expect(permissions).toEqual({
      isAdmin: true,
      canViewWorkflows: true,
      canRequestAccess: false,
      canReviewAccessRequests: true,
      canShareWorkflows: true,
      canUnshareWorkflows: true,
      canManageWil: true,
      canManageProject: true,
    });
  });

  describe('CSTAR ui:actor portal access', () => {
    const uiActorTenantRoles = [{ roles: ['ui:actor'] }];

    it('grants WIL and keeps access request for an unprovisioned identity holding ui:actor', () => {
      const permissions = computePermissions(null, makeFeatureFlagService(), uiActorTenantRoles);

      expect(permissions).toEqual({
        isAdmin: false,
        canViewWorkflows: false,
        canRequestAccess: true,
        canReviewAccessRequests: false,
        canShareWorkflows: false,
        canUnshareWorkflows: false,
        canManageWil: true,
        canManageProject: false,
      });
    });

    it('drops access request for a BCeID login but keeps WIL for ui:actor', () => {
      const permissions = computePermissions(null, makeFeatureFlagService(), uiActorTenantRoles, true);

      expect(permissions.canRequestAccess).toBe(false);
      expect(permissions.canManageWil).toBe(true);
    });

    it('leaves a BCeID login with no tenant role with no capabilities', () => {
      const permissions = computePermissions(null, makeFeatureFlagService(), [], true);

      expect(Object.values(permissions).every((value) => value === false)).toBe(true);
    });

    it('grants WIL to a role-less n8n user holding ui:actor in any tenant', () => {
      const permissions = computePermissions({ disabled: false, role: null }, makeFeatureFlagService(), [
        { roles: ['project:other'] },
        { roles: ['ui:actor'] },
      ]);

      expect(permissions.canManageWil).toBe(true);
      expect(permissions.canRequestAccess).toBe(true);
      expect(permissions.canViewWorkflows).toBe(false);
      expect(permissions.canManageProject).toBe(false);
    });

    it('keeps a disabled n8n user blocked even with ui:actor', () => {
      const permissions = computePermissions(
        { disabled: true, role: memberRole },
        makeFeatureFlagService(),
        uiActorTenantRoles,
      );

      expect(permissions.canManageWil).toBe(false);
      expect(permissions.canRequestAccess).toBe(true);
    });

    it('does not treat other CSTAR roles as portal access', () => {
      const permissions = computePermissions(null, makeFeatureFlagService(), [{ roles: ['project:viewer-ish'] }]);

      expect(permissions.canManageWil).toBe(false);
      expect(permissions.canRequestAccess).toBe(true);
    });

    it('falls back to access request for ui:actor users when WIL is disabled', () => {
      const permissions = computePermissions(null, makeFeatureFlagService([]), uiActorTenantRoles);

      expect(permissions.canManageWil).toBe(false);
      expect(permissions.canRequestAccess).toBe(true);
    });
  });

  it('respects feature flags for eligible users', () => {
    const permissions = computePermissions({ disabled: false, role: memberRole }, makeFeatureFlagService([]));

    expect(permissions.canViewWorkflows).toBe(false);
    expect(permissions.canShareWorkflows).toBe(false);
    expect(permissions.canManageWil).toBe(false);
    expect(permissions.canManageProject).toBe(false);
  });
});
