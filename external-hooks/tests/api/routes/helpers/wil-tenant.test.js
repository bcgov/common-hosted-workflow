"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Unit tests for `src/api/routes/helpers/wil-tenant.ts`.
 */
const vitest_1 = require("vitest");
const wil_tenant_1 = require("../../../../src/api/routes/helpers/wil-tenant");
const mocks_1 = require("../../../helpers/mocks");
const errors_1 = require("../../../../src/api/utils/errors");
const VALID_UUID = 'a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d';
function makeTenantRepo(projectIds = ['proj-1']) {
    return {
        getProjectIdsByTenantId: vitest_1.vi.fn().mockResolvedValue(projectIds),
    };
}
(0, vitest_1.describe)('resolveWilTenantProjectIds', () => {
    (0, vitest_1.it)('returns tenantId and project IDs for a valid tenant', async () => {
        const repo = makeTenantRepo(['proj-a', 'proj-b']);
        const req = (0, mocks_1.createMockRequest)({ headers: { 'x-tenant-id': VALID_UUID } });
        const result = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, repo);
        (0, vitest_1.expect)(result).toEqual({ tenantId: VALID_UUID, projectIds: ['proj-a', 'proj-b'] });
        (0, vitest_1.expect)(repo.getProjectIdsByTenantId).toHaveBeenCalledWith(VALID_UUID);
    });
    (0, vitest_1.it)('throws 400 when x-tenant-id header is missing', async () => {
        const repo = makeTenantRepo();
        const req = (0, mocks_1.createMockRequest)({ headers: {} });
        await (0, vitest_1.expect)((0, wil_tenant_1.resolveWilTenantProjectIds)(req, repo)).rejects.toThrow(errors_1.AppError);
        try {
            await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, repo);
        }
        catch (err) {
            (0, vitest_1.expect)(err.statusCode).toBe(400);
            (0, vitest_1.expect)(err.message).toContain('Missing');
        }
    });
    (0, vitest_1.it)('throws 400 when x-tenant-id is empty string', async () => {
        const repo = makeTenantRepo();
        const req = (0, mocks_1.createMockRequest)({ headers: { 'x-tenant-id': '   ' } });
        await (0, vitest_1.expect)((0, wil_tenant_1.resolveWilTenantProjectIds)(req, repo)).rejects.toThrow(errors_1.AppError);
        try {
            await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, repo);
        }
        catch (err) {
            (0, vitest_1.expect)(err.statusCode).toBe(400);
        }
    });
    (0, vitest_1.it)('throws 400 when x-tenant-id is not a valid UUID', async () => {
        const repo = makeTenantRepo();
        const req = (0, mocks_1.createMockRequest)({ headers: { 'x-tenant-id': 'not-a-uuid' } });
        await (0, vitest_1.expect)((0, wil_tenant_1.resolveWilTenantProjectIds)(req, repo)).rejects.toThrow(errors_1.AppError);
        try {
            await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, repo);
        }
        catch (err) {
            (0, vitest_1.expect)(err.statusCode).toBe(400);
            (0, vitest_1.expect)(err.message).toContain('Invalid');
        }
    });
    (0, vitest_1.it)('throws 403 when no projects are linked to the tenant', async () => {
        const repo = makeTenantRepo([]);
        const req = (0, mocks_1.createMockRequest)({ headers: { 'x-tenant-id': VALID_UUID } });
        await (0, vitest_1.expect)((0, wil_tenant_1.resolveWilTenantProjectIds)(req, repo)).rejects.toThrow(errors_1.AppError);
        try {
            await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, repo);
        }
        catch (err) {
            (0, vitest_1.expect)(err.statusCode).toBe(403);
            (0, vitest_1.expect)(err.message).toContain('No projects');
        }
    });
    (0, vitest_1.it)('trims whitespace from the tenant id header', async () => {
        const repo = makeTenantRepo(['proj-1']);
        const req = (0, mocks_1.createMockRequest)({ headers: { 'x-tenant-id': `  ${VALID_UUID}  ` } });
        const result = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, repo);
        (0, vitest_1.expect)(result).toEqual({ tenantId: VALID_UUID, projectIds: ['proj-1'] });
        (0, vitest_1.expect)(repo.getProjectIdsByTenantId).toHaveBeenCalledWith(VALID_UUID);
    });
    (0, vitest_1.it)('accepts uppercase UUIDs', async () => {
        const repo = makeTenantRepo(['proj-1']);
        const upperUuid = VALID_UUID.toUpperCase();
        const req = (0, mocks_1.createMockRequest)({ headers: { 'x-tenant-id': upperUuid } });
        const result = await (0, wil_tenant_1.resolveWilTenantProjectIds)(req, repo);
        (0, vitest_1.expect)(result.projectIds).toEqual(['proj-1']);
        (0, vitest_1.expect)(result.tenantId).toBe(upperUuid);
    });
});
