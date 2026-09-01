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

  it('respects feature flags for eligible users', () => {
    const permissions = computePermissions({ disabled: false, role: memberRole }, makeFeatureFlagService([]));

    expect(permissions.canViewWorkflows).toBe(false);
    expect(permissions.canShareWorkflows).toBe(false);
    expect(permissions.canManageWil).toBe(false);
    expect(permissions.canManageProject).toBe(false);
  });
});
