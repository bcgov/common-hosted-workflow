"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const permissions_1 = require("../../../src/api/helpers/permissions");
function makeFeatureFlagService(enabled = ['workflow-share', 'wil', 'project']) {
    return {
        isFeatureEnabled: vitest_1.vi.fn((flag) => enabled.includes(flag)),
    };
}
const memberRole = { slug: 'global:member' };
const adminRole = { slug: 'global:admin' };
const ownerRole = { slug: 'global:owner' };
(0, vitest_1.describe)('computePermissions', () => {
    (0, vitest_1.it)('grants only access-request capability to an unprovisioned identity (no n8n user)', () => {
        const permissions = (0, permissions_1.computePermissions)(null, makeFeatureFlagService());
        (0, vitest_1.expect)(permissions).toEqual({
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
    (0, vitest_1.it)('grants only access-request capability to an enabled user without a role', () => {
        const permissions = (0, permissions_1.computePermissions)({ disabled: false, role: null }, makeFeatureFlagService());
        (0, vitest_1.expect)(permissions).toEqual({
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
    (0, vitest_1.it)('denies every n8n-derived capability to a disabled admin retaining a stale role', () => {
        const permissions = (0, permissions_1.computePermissions)({ disabled: true, role: adminRole }, makeFeatureFlagService());
        (0, vitest_1.expect)(permissions).toEqual({
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
    (0, vitest_1.it)('denies admin capabilities to a disabled owner retaining a stale role', () => {
        const permissions = (0, permissions_1.computePermissions)({ disabled: true, role: ownerRole }, makeFeatureFlagService());
        (0, vitest_1.expect)(permissions.isAdmin).toBe(false);
        (0, vitest_1.expect)(permissions.canReviewAccessRequests).toBe(false);
        (0, vitest_1.expect)(permissions.canUnshareWorkflows).toBe(false);
        (0, vitest_1.expect)(permissions.canRequestAccess).toBe(true);
    });
    (0, vitest_1.it)('denies n8n-derived capabilities to a disabled member', () => {
        const permissions = (0, permissions_1.computePermissions)({ disabled: true, role: memberRole }, makeFeatureFlagService());
        (0, vitest_1.expect)(permissions.canViewWorkflows).toBe(false);
        (0, vitest_1.expect)(permissions.canShareWorkflows).toBe(false);
        (0, vitest_1.expect)(permissions.canManageWil).toBe(false);
        (0, vitest_1.expect)(permissions.canManageProject).toBe(false);
        (0, vitest_1.expect)(permissions.canRequestAccess).toBe(true);
    });
    (0, vitest_1.it)('retains member capabilities for an enabled, eligible member', () => {
        const permissions = (0, permissions_1.computePermissions)({ disabled: false, role: memberRole }, makeFeatureFlagService());
        (0, vitest_1.expect)(permissions).toEqual({
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
    (0, vitest_1.it)('retains admin capabilities for an enabled admin', () => {
        const permissions = (0, permissions_1.computePermissions)({ disabled: false, role: adminRole }, makeFeatureFlagService());
        (0, vitest_1.expect)(permissions).toEqual({
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
    (0, vitest_1.it)('respects feature flags for eligible users', () => {
        const permissions = (0, permissions_1.computePermissions)({ disabled: false, role: memberRole }, makeFeatureFlagService([]));
        (0, vitest_1.expect)(permissions.canViewWorkflows).toBe(false);
        (0, vitest_1.expect)(permissions.canShareWorkflows).toBe(false);
        (0, vitest_1.expect)(permissions.canManageWil).toBe(false);
        (0, vitest_1.expect)(permissions.canManageProject).toBe(false);
    });
});
