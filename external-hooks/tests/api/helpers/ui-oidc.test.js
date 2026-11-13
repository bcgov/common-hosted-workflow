"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
vitest_1.vi.mock('@config', async (importOriginal) => {
    const original = await importOriginal();
    return { ...original, READONLY_MODE: true };
});
const ui_oidc_1 = require("../../../src/api/helpers/ui-oidc");
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
};
(0, vitest_1.describe)('buildSessionSummary in read-only mode', () => {
    (0, vitest_1.it)('reports goldDr for an authenticated session', () => {
        (0, vitest_1.expect)((0, ui_oidc_1.buildSessionSummary)(resolvedSession).goldDr).toBe(true);
    });
    (0, vitest_1.it)('reports goldDr for an anonymous session', () => {
        (0, vitest_1.expect)((0, ui_oidc_1.buildSessionSummary)(null).goldDr).toBe(true);
    });
});
