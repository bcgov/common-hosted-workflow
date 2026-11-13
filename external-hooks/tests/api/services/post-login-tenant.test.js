'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const post_login_tenant_1 = require('../../../src/api/services/post-login-tenant');
(0, vitest_1.describe)('runPostLoginTenantWork – unified post-login operation', () => {
  (0, vitest_1.beforeEach)(() => vitest_1.vi.restoreAllMocks());
  function createMocks(overrides = {}) {
    const cstarService = {
      isConfigured: vitest_1.vi.fn(() => true),
      getUserTenants: vitest_1.vi.fn(async () => [{ id: 't1', name: 'Tenant 1' }]),
      getUserGroupsWithRoles: vitest_1.vi.fn(async () => [
        { name: 'G1', sharedServiceRoles: [{ name: 'project:editor' }] },
      ]),
    };
    const tenantService = {
      prewarmTenantRolesAndGroups: vitest_1.vi.fn(async () => ({})),
    };
    const tenantProjectSyncService = {
      syncTenantsForUser: vitest_1.vi.fn(async () => undefined),
    };
    return { cstarService, tenantService, tenantProjectSyncService, ...overrides };
  }
  (0, vitest_1.it)(
    'fetches tenants once and reuses for both prewarm and sync (avoids duplicate CSTAR tenants call)',
    async () => {
      const { cstarService, tenantService, tenantProjectSyncService } = createMocks();
      const tenants = [{ id: 't1', name: 'Tenant 1' }];
      cstarService.getUserTenants.mockResolvedValue(tenants);
      await (0, post_login_tenant_1.runPostLoginTenantWork)({
        email: 'user@example.com',
        ssoUserId: 'sso-1',
        accessToken: 'token-1',
        n8nUserId: 'u1',
        tenantService: tenantService,
        tenantProjectSyncService: tenantProjectSyncService,
        cstarService: cstarService,
      });
      (0, vitest_1.expect)(cstarService.getUserTenants).toHaveBeenCalledTimes(1);
      (0, vitest_1.expect)(cstarService.getUserTenants).toHaveBeenCalledWith({
        ssoUserId: 'sso-1',
        accessToken: 'token-1',
      });
      (0, vitest_1.expect)(tenantService.prewarmTenantRolesAndGroups).toHaveBeenCalledWith({
        email: 'user@example.com',
        ssoUserId: 'sso-1',
        accessToken: 'token-1',
        tenants,
      });
      (0, vitest_1.expect)(tenantProjectSyncService.syncTenantsForUser).toHaveBeenCalledWith({
        ssoUserId: 'sso-1',
        n8nUserId: 'u1',
        accessToken: 'token-1',
        tenants,
      });
    },
  );
  (0, vitest_1.it)('reuses pre-fetched tenants when provided (avoids second tenants fetch)', async () => {
    const { cstarService, tenantService, tenantProjectSyncService } = createMocks();
    const tenants = [{ id: 't1', name: 'Tenant 1' }];
    await (0, post_login_tenant_1.runPostLoginTenantWork)({
      email: 'user@example.com',
      ssoUserId: 'sso-1',
      accessToken: 'token-1',
      n8nUserId: 'u1',
      tenantService: tenantService,
      tenantProjectSyncService: tenantProjectSyncService,
      cstarService: cstarService,
      tenants: tenants,
    });
    (0, vitest_1.expect)(cstarService.getUserTenants).not.toHaveBeenCalled();
    (0, vitest_1.expect)(tenantService.prewarmTenantRolesAndGroups).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({ tenants }),
    );
    (0, vitest_1.expect)(tenantProjectSyncService.syncTenantsForUser).toHaveBeenCalledWith(
      vitest_1.expect.objectContaining({ tenants }),
    );
  });
  (0, vitest_1.it)('logs but does not throw when tenants fetch fails (login-success contract)', async () => {
    const { cstarService, tenantService, tenantProjectSyncService } = createMocks();
    cstarService.getUserTenants.mockRejectedValue(new Error('CSTAR down'));
    await (0, vitest_1.expect)(
      (0, post_login_tenant_1.runPostLoginTenantWork)({
        email: 'user@example.com',
        ssoUserId: 'sso-1',
        accessToken: 'token-1',
        n8nUserId: 'u1',
        tenantService: tenantService,
        tenantProjectSyncService: tenantProjectSyncService,
        cstarService: cstarService,
      }),
    ).resolves.toBeUndefined();
    (0, vitest_1.expect)(tenantService.prewarmTenantRolesAndGroups).not.toHaveBeenCalled();
    (0, vitest_1.expect)(tenantProjectSyncService.syncTenantsForUser).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('logs pre-warm failure but still runs sync, and vice versa (Promise.allSettled)', async () => {
    const { cstarService, tenantService, tenantProjectSyncService } = createMocks();
    tenantService.prewarmTenantRolesAndGroups.mockRejectedValue(new Error('prewarm fail'));
    tenantProjectSyncService.syncTenantsForUser.mockRejectedValue(new Error('sync fail'));
    await (0, vitest_1.expect)(
      (0, post_login_tenant_1.runPostLoginTenantWork)({
        email: 'user@example.com',
        ssoUserId: 'sso-1',
        accessToken: 'token-1',
        n8nUserId: 'u1',
        tenantService: tenantService,
        tenantProjectSyncService: tenantProjectSyncService,
        cstarService: cstarService,
      }),
    ).resolves.toBeUndefined();
    (0, vitest_1.expect)(tenantService.prewarmTenantRolesAndGroups).toHaveBeenCalled();
    (0, vitest_1.expect)(tenantProjectSyncService.syncTenantsForUser).toHaveBeenCalled();
  });
  (0, vitest_1.it)('skips when accessToken missing', async () => {
    const { cstarService, tenantService, tenantProjectSyncService } = createMocks();
    await (0, post_login_tenant_1.runPostLoginTenantWork)({
      email: 'user@example.com',
      ssoUserId: 'sso-1',
      accessToken: undefined,
      n8nUserId: 'u1',
      tenantService: tenantService,
      tenantProjectSyncService: tenantProjectSyncService,
      cstarService: cstarService,
    });
    (0, vitest_1.expect)(cstarService.getUserTenants).not.toHaveBeenCalled();
    (0, vitest_1.expect)(tenantService.prewarmTenantRolesAndGroups).not.toHaveBeenCalled();
    (0, vitest_1.expect)(tenantProjectSyncService.syncTenantsForUser).not.toHaveBeenCalled();
  });
  (0, vitest_1.it)('skips when CSTAR not configured', async () => {
    const { cstarService, tenantService, tenantProjectSyncService } = createMocks();
    cstarService.isConfigured.mockReturnValue(false);
    await (0, post_login_tenant_1.runPostLoginTenantWork)({
      email: 'user@example.com',
      ssoUserId: 'sso-1',
      accessToken: 'token-1',
      n8nUserId: 'u1',
      tenantService: tenantService,
      tenantProjectSyncService: tenantProjectSyncService,
      cstarService: cstarService,
    });
    (0, vitest_1.expect)(cstarService.getUserTenants).not.toHaveBeenCalled();
  });
});
