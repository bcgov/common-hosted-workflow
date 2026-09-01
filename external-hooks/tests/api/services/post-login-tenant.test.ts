import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPostLoginTenantWork } from '../../../src/api/services/post-login-tenant';

describe('runPostLoginTenantWork – unified post-login operation', () => {
  beforeEach(() => vi.restoreAllMocks());

  function createMocks(overrides: Record<string, any> = {}) {
    const cstarService: any = {
      isConfigured: vi.fn(() => true),
      getUserTenants: vi.fn(async () => [{ id: 't1', name: 'Tenant 1' }]),
      getUserGroupsWithRoles: vi.fn(async () => [{ name: 'G1', sharedServiceRoles: [{ name: 'project:editor' }] }]),
    };
    const tenantService: any = {
      prewarmTenantRolesAndGroups: vi.fn(async () => ({})),
    };
    const tenantProjectSyncService: any = {
      syncTenantsForUser: vi.fn(async () => undefined),
    };
    return { cstarService, tenantService, tenantProjectSyncService, ...overrides };
  }

  it('fetches tenants once and reuses for both prewarm and sync (avoids duplicate CSTAR tenants call)', async () => {
    const { cstarService, tenantService, tenantProjectSyncService } = createMocks();
    const tenants = [{ id: 't1', name: 'Tenant 1' }];
    cstarService.getUserTenants.mockResolvedValue(tenants);

    await runPostLoginTenantWork({
      email: 'user@example.com',
      ssoUserId: 'sso-1',
      accessToken: 'token-1',
      n8nUserId: 'u1',
      tenantService: tenantService as any,
      tenantProjectSyncService: tenantProjectSyncService as any,
      cstarService: cstarService as any,
    });

    expect(cstarService.getUserTenants).toHaveBeenCalledTimes(1);
    expect(cstarService.getUserTenants).toHaveBeenCalledWith({ ssoUserId: 'sso-1', accessToken: 'token-1' });
    expect(tenantService.prewarmTenantRolesAndGroups).toHaveBeenCalledWith({
      email: 'user@example.com',
      ssoUserId: 'sso-1',
      accessToken: 'token-1',
      tenants,
    });
    expect(tenantProjectSyncService.syncTenantsForUser).toHaveBeenCalledWith({
      ssoUserId: 'sso-1',
      n8nUserId: 'u1',
      accessToken: 'token-1',
      tenants,
    });
  });

  it('reuses pre-fetched tenants when provided (avoids second tenants fetch)', async () => {
    const { cstarService, tenantService, tenantProjectSyncService } = createMocks();
    const tenants = [{ id: 't1', name: 'Tenant 1' }];

    await runPostLoginTenantWork({
      email: 'user@example.com',
      ssoUserId: 'sso-1',
      accessToken: 'token-1',
      n8nUserId: 'u1',
      tenantService: tenantService as any,
      tenantProjectSyncService: tenantProjectSyncService as any,
      cstarService: cstarService as any,
      tenants: tenants as any,
    });

    expect(cstarService.getUserTenants).not.toHaveBeenCalled();
    expect(tenantService.prewarmTenantRolesAndGroups).toHaveBeenCalledWith(expect.objectContaining({ tenants }));
    expect(tenantProjectSyncService.syncTenantsForUser).toHaveBeenCalledWith(expect.objectContaining({ tenants }));
  });

  it('logs but does not throw when tenants fetch fails (login-success contract)', async () => {
    const { cstarService, tenantService, tenantProjectSyncService } = createMocks();
    cstarService.getUserTenants.mockRejectedValue(new Error('CSTAR down'));

    await expect(
      runPostLoginTenantWork({
        email: 'user@example.com',
        ssoUserId: 'sso-1',
        accessToken: 'token-1',
        n8nUserId: 'u1',
        tenantService: tenantService as any,
        tenantProjectSyncService: tenantProjectSyncService as any,
        cstarService: cstarService as any,
      }),
    ).resolves.toBeUndefined();

    expect(tenantService.prewarmTenantRolesAndGroups).not.toHaveBeenCalled();
    expect(tenantProjectSyncService.syncTenantsForUser).not.toHaveBeenCalled();
  });

  it('logs pre-warm failure but still runs sync, and vice versa (Promise.allSettled)', async () => {
    const { cstarService, tenantService, tenantProjectSyncService } = createMocks();
    tenantService.prewarmTenantRolesAndGroups.mockRejectedValue(new Error('prewarm fail'));
    tenantProjectSyncService.syncTenantsForUser.mockRejectedValue(new Error('sync fail'));

    await expect(
      runPostLoginTenantWork({
        email: 'user@example.com',
        ssoUserId: 'sso-1',
        accessToken: 'token-1',
        n8nUserId: 'u1',
        tenantService: tenantService as any,
        tenantProjectSyncService: tenantProjectSyncService as any,
        cstarService: cstarService as any,
      }),
    ).resolves.toBeUndefined();

    expect(tenantService.prewarmTenantRolesAndGroups).toHaveBeenCalled();
    expect(tenantProjectSyncService.syncTenantsForUser).toHaveBeenCalled();
  });

  it('skips when accessToken missing', async () => {
    const { cstarService, tenantService, tenantProjectSyncService } = createMocks();

    await runPostLoginTenantWork({
      email: 'user@example.com',
      ssoUserId: 'sso-1',
      accessToken: undefined,
      n8nUserId: 'u1',
      tenantService: tenantService as any,
      tenantProjectSyncService: tenantProjectSyncService as any,
      cstarService: cstarService as any,
    } as any);

    expect(cstarService.getUserTenants).not.toHaveBeenCalled();
    expect(tenantService.prewarmTenantRolesAndGroups).not.toHaveBeenCalled();
    expect(tenantProjectSyncService.syncTenantsForUser).not.toHaveBeenCalled();
  });

  it('skips when CSTAR not configured', async () => {
    const { cstarService, tenantService, tenantProjectSyncService } = createMocks();
    cstarService.isConfigured.mockReturnValue(false);

    await runPostLoginTenantWork({
      email: 'user@example.com',
      ssoUserId: 'sso-1',
      accessToken: 'token-1',
      n8nUserId: 'u1',
      tenantService: tenantService as any,
      tenantProjectSyncService: tenantProjectSyncService as any,
      cstarService: cstarService as any,
    });

    expect(cstarService.getUserTenants).not.toHaveBeenCalled();
  });
});
