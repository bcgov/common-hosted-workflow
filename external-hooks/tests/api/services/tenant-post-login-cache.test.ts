import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    getDel: vi.fn().mockResolvedValue(null),
  })),
}));

import { TenantService } from '../../../src/api/services/tenant.service';
import * as store from '../../../src/api/helpers/ui-oidc-store';

describe('TenantService – first session load uses pre-warmed data (OIDC-07)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('after prewarm, getTenantRolesForSession hits cache and does not call CSTAR again', async () => {
    const mockCstar: any = {
      isConfigured: () => true,
      getUserTenants: vi.fn(async () => [{ id: 't1', name: 'Tenant 1' }]),
      getUserGroupsWithRoles: vi.fn(async () => [{ name: 'G1', sharedServiceRoles: [{ name: 'project:editor' }] }]),
    };
    const tenantService = new TenantService({ tenantProjectRelation: {} } as any, { project: {} } as any, mockCstar);

    // Mock Redis store to simulate real cache population
    const cache = new Map<string, any>();
    const setRolesSpy = vi.spyOn(store, 'setUiTenantRoles').mockImplementation(async (email: string, roles: any) => {
      cache.set(`roles:${email}`, roles);
    });
    const setGroupsSpy = vi.spyOn(store, 'setUiTenantGroups').mockImplementation(async (email: string, groups: any) => {
      cache.set(`groups:${email}`, groups);
    });
    vi.spyOn(store, 'getUiTenantRoles').mockImplementation(
      async (email: string) => cache.get(`roles:${email}`) ?? null,
    );
    vi.spyOn(store, 'getUiTenantGroups').mockImplementation(
      async (email: string) => cache.get(`groups:${email}`) ?? null,
    );
    vi.spyOn(store, 'getUiOidcAccessTokenByEmail').mockResolvedValue('token-1');
    vi.spyOn(store, 'getUiOidcAccessTokenRecord').mockResolvedValue({
      email: 'user@example.com',
      expiresAt: Date.now() + 3600000,
    });

    await tenantService.prewarmTenantRolesAndGroups({
      email: 'user@example.com',
      ssoUserId: 'sso-1',
      accessToken: 'token-1',
    });

    expect(mockCstar.getUserTenants).toHaveBeenCalledTimes(1);
    expect(mockCstar.getUserGroupsWithRoles).toHaveBeenCalledTimes(1);
    expect(setRolesSpy).toHaveBeenCalled();
    expect(setGroupsSpy).toHaveBeenCalled();

    // Reset CSTAR call count
    mockCstar.getUserTenants.mockClear();
    mockCstar.getUserGroupsWithRoles.mockClear();

    // First session load should hit cache, not CSTAR
    const rolesResult = await tenantService.getTenantRolesForSession({
      email: 'user@example.com',
      ssoUserId: 'sso-1',
      accessToken: 'token-1',
    });
    const groupsResult = await tenantService.getTenantGroupsForSession({
      email: 'user@example.com',
      ssoUserId: 'sso-1',
      accessToken: 'token-1',
    });

    expect(rolesResult.roles.length).toBe(1);
    expect(groupsResult.groups.length).toBe(1);
    expect(mockCstar.getUserTenants).not.toHaveBeenCalled();
    expect(mockCstar.getUserGroupsWithRoles).not.toHaveBeenCalled();
  });

  it('post-login prewarm and first session share single CSTAR tenants fetch when tenants are passed', async () => {
    const mockCstar: any = {
      isConfigured: () => true,
      getUserTenants: vi.fn(async () => [{ id: 't1', name: 'Tenant 1' }]),
      getUserGroupsWithRoles: vi.fn(async () => [{ name: 'G1', sharedServiceRoles: [{ name: 'project:editor' }] }]),
    };
    const tenantService = new TenantService({ tenantProjectRelation: {} } as any, { project: {} } as any, mockCstar);
    const cache = new Map<string, any>();
    vi.spyOn(store, 'setUiTenantRoles').mockImplementation(async (e, r) => cache.set(`roles:${e}`, r));
    vi.spyOn(store, 'setUiTenantGroups').mockImplementation(async (e, g) => cache.set(`groups:${e}`, g));
    vi.spyOn(store, 'getUiTenantRoles').mockImplementation(async (e) => cache.get(`roles:${e}`) ?? null);
    vi.spyOn(store, 'getUiTenantGroups').mockImplementation(async (e) => cache.get(`groups:${e}`) ?? null);
    vi.spyOn(store, 'getUiOidcAccessTokenByEmail').mockResolvedValue('token-1');
    vi.spyOn(store, 'getUiOidcAccessTokenRecord').mockResolvedValue({
      email: 'user@example.com',
      expiresAt: Date.now() + 3600000,
    });

    const tenants = [{ id: 't1', name: 'Tenant 1' }];
    await tenantService.prewarmTenantRolesAndGroups({
      email: 'user@example.com',
      ssoUserId: 'sso-1',
      accessToken: 'token-1',
      tenants: tenants as any,
    });

    expect(mockCstar.getUserTenants).not.toHaveBeenCalled();
    expect(mockCstar.getUserGroupsWithRoles).toHaveBeenCalledTimes(1);
  });
});
