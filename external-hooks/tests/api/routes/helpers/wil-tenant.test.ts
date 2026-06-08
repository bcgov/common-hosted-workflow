/**
 * Unit tests for `src/api/routes/helpers/wil-tenant.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { resolveWilTenantProjectIds } from '../../../../src/api/routes/helpers/wil-tenant';
import { createMockRequest } from '../../../helpers/mocks';
import { AppError } from '../../../../src/api/utils/errors';

const VALID_UUID = 'a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d';

function makeTenantRepo(projectIds: string[] = ['proj-1']) {
  return {
    getProjectIdsByTenantId: vi.fn().mockResolvedValue(projectIds),
  };
}

describe('resolveWilTenantProjectIds', () => {
  it('returns project IDs for a valid tenant', async () => {
    const repo = makeTenantRepo(['proj-a', 'proj-b']);
    const req = createMockRequest({ headers: { 'x-tenant-id': VALID_UUID } });

    const result = await resolveWilTenantProjectIds(req, repo as any);

    expect(result).toEqual(['proj-a', 'proj-b']);
    expect(repo.getProjectIdsByTenantId).toHaveBeenCalledWith(VALID_UUID);
  });

  it('throws 400 when x-tenant-id header is missing', async () => {
    const repo = makeTenantRepo();
    const req = createMockRequest({ headers: {} });

    await expect(resolveWilTenantProjectIds(req, repo as any)).rejects.toThrow(AppError);
    try {
      await resolveWilTenantProjectIds(req, repo as any);
    } catch (err) {
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toContain('Missing');
    }
  });

  it('throws 400 when x-tenant-id is empty string', async () => {
    const repo = makeTenantRepo();
    const req = createMockRequest({ headers: { 'x-tenant-id': '   ' } });

    await expect(resolveWilTenantProjectIds(req, repo as any)).rejects.toThrow(AppError);
    try {
      await resolveWilTenantProjectIds(req, repo as any);
    } catch (err) {
      expect((err as AppError).statusCode).toBe(400);
    }
  });

  it('throws 400 when x-tenant-id is not a valid UUID', async () => {
    const repo = makeTenantRepo();
    const req = createMockRequest({ headers: { 'x-tenant-id': 'not-a-uuid' } });

    await expect(resolveWilTenantProjectIds(req, repo as any)).rejects.toThrow(AppError);
    try {
      await resolveWilTenantProjectIds(req, repo as any);
    } catch (err) {
      expect((err as AppError).statusCode).toBe(400);
      expect((err as AppError).message).toContain('Invalid');
    }
  });

  it('throws 403 when no projects are linked to the tenant', async () => {
    const repo = makeTenantRepo([]);
    const req = createMockRequest({ headers: { 'x-tenant-id': VALID_UUID } });

    await expect(resolveWilTenantProjectIds(req, repo as any)).rejects.toThrow(AppError);
    try {
      await resolveWilTenantProjectIds(req, repo as any);
    } catch (err) {
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).message).toContain('No projects');
    }
  });

  it('trims whitespace from the tenant id header', async () => {
    const repo = makeTenantRepo(['proj-1']);
    const req = createMockRequest({ headers: { 'x-tenant-id': `  ${VALID_UUID}  ` } });

    const result = await resolveWilTenantProjectIds(req, repo as any);

    expect(result).toEqual(['proj-1']);
    expect(repo.getProjectIdsByTenantId).toHaveBeenCalledWith(VALID_UUID);
  });

  it('accepts uppercase UUIDs', async () => {
    const repo = makeTenantRepo(['proj-1']);
    const upperUuid = VALID_UUID.toUpperCase();
    const req = createMockRequest({ headers: { 'x-tenant-id': upperUuid } });

    const result = await resolveWilTenantProjectIds(req, repo as any);

    expect(result).toEqual(['proj-1']);
  });
});
