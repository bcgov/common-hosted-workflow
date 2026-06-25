import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CstarService } from './cstar.service';
import type { TenantRole, TenantGroup } from '../helpers/ui-oidc-store';
import { invalidateTenantRoles } from '../helpers/tenant-roles';
import { invalidateTenantGroups } from '../helpers/tenant-groups';
import {
  setUiTenantRoles,
  setUiTenantGroups,
  getUiTenantRoles,
  getUiTenantGroups,
  getUiOidcAccessTokenByEmail,
} from '../helpers/ui-oidc-store';
import { createLogger } from '../utils/logger';

const log = createLogger('TenantService');

export type TenantSource = 'cstar' | 'personal';

export type TenantListItem = {
  id: string;
  name: string;
  source: TenantSource;
  projectId?: string;
};

export type ListTenantsForUserParams = {
  ssoUserId: string;
  accessToken?: string;
  n8nUserId?: string;
};

export class TenantService {
  constructor(
    private readonly customRepositories: CustomRepositories,
    private readonly n8nRepositories: N8nRepositories,
    private readonly cstarService: CstarService,
  ) {}

  /**
   * Returns combined tenant list for the user:
   * 1. CSTAR tenants (from external API, using user's OIDC token)
   * 2. Personal project (from n8n, represented as a pseudo-tenant)
   *
   * If CSTAR is unreachable or returns no tenants, only the personal project is returned.
   */
  async listTenantsForUser(params: ListTenantsForUserParams): Promise<TenantListItem[]> {
    const { ssoUserId, accessToken, n8nUserId } = params;
    const tenants: TenantListItem[] = [];

    // Fetch CSTAR tenants (graceful fallback on failure)
    if (accessToken && this.cstarService.isConfigured()) {
      const cstarTenants = await this.cstarService.getUserTenants({
        ssoUserId,
        accessToken,
      });

      for (const ct of cstarTenants) {
        tenants.push({
          id: ct.id,
          name: ct.name,
          source: 'cstar',
        });
      }
    }

    // Add personal project as a pseudo-tenant
    if (n8nUserId) {
      const personalProject = await this.n8nRepositories.project.getPersonalProjectForUser(n8nUserId);
      if (personalProject) {
        const tenantId = await this.customRepositories.tenantProjectRelation.getTenantIdByProjectId(personalProject.id);
        if (tenantId) {
          tenants.push({
            id: tenantId,
            name: 'My Personal Project',
            source: 'personal',
            projectId: personalProject.id,
          });
        }
      }
    }

    return tenants;
  }

  /**
   * Legacy method — returns tenants from DB only.
   * @deprecated Use listTenantsForUser instead.
   */
  async listTenants(): Promise<TenantListItem[]> {
    const tenantIds = await this.customRepositories.tenantProjectRelation.listDistinctTenantIds();
    const source: TenantSource = 'cstar';

    return tenantIds.map((id, index) => ({
      id,
      name: `Tenant ${index + 1}`,
      source,
    }));
  }

  /**
   * Resolves tenant roles for a user session (cache-aside pattern).
   * Returns cached value from Redis if available, otherwise fetches from CSTAR.
   * On cache miss, fetches both roles and groups in a single CSTAR call and populates both caches.
   */
  async getTenantRolesForSession(params: {
    email: string;
    ssoUserId: string;
    accessToken?: string;
  }): Promise<TenantRole[]> {
    if (!this.cstarService.isConfigured()) {
      return [];
    }

    const cached = await getUiTenantRoles(params.email);
    if (cached) {
      return cached;
    }

    // Cache miss — fetch both and populate both caches
    const { roles } = await this.fetchAndCacheRolesAndGroups(params);
    return roles;
  }

  /**
   * Resolves tenant groups for a user session (cache-aside pattern).
   * Returns cached value from Redis if available, otherwise fetches from CSTAR.
   * On cache miss, fetches both roles and groups in a single CSTAR call and populates both caches.
   */
  async getTenantGroupsForSession(params: {
    email: string;
    ssoUserId: string;
    accessToken?: string;
  }): Promise<TenantGroup[]> {
    if (!this.cstarService.isConfigured()) {
      return [];
    }

    const cached = await getUiTenantGroups(params.email);
    if (cached) {
      return cached;
    }

    // Cache miss — fetch both and populate both caches
    const { groups } = await this.fetchAndCacheRolesAndGroups(params);
    return groups;
  }

  /**
   * Fetches roles and groups from CSTAR in a single pass and stores both in Redis.
   * Called on cache miss from either getTenantRolesForSession or getTenantGroupsForSession.
   */
  private async fetchAndCacheRolesAndGroups(params: {
    email: string;
    ssoUserId: string;
    accessToken?: string;
  }): Promise<{ roles: TenantRole[]; groups: TenantGroup[] }> {
    const token = params.accessToken ?? (await getUiOidcAccessTokenByEmail(params.email));
    if (!token) {
      log.debug('No access token available for tenant roles/groups fetch', { email: params.email });
      return { roles: [], groups: [] };
    }

    const { roles, groups } = await this.fetchTenantRolesAndGroupsFromCstar(params.ssoUserId, token);

    // Populate both caches (even if empty, to avoid repeated upstream calls)
    await Promise.all([setUiTenantRoles(params.email, roles), setUiTenantGroups(params.email, groups)]);

    return { roles, groups };
  }

  /**
   * Pre-warms both tenant roles and tenant groups cache at login time.
   * Uses a single CSTAR call (getUserGroupsWithRoles) per tenant to derive both.
   * Throws on failure — caller is responsible for error handling.
   */
  async prewarmTenantRolesAndGroups(params: { email: string; ssoUserId: string; accessToken: string }): Promise<void> {
    if (!this.cstarService.isConfigured()) {
      return;
    }

    const { roles, groups } = await this.fetchTenantRolesAndGroupsFromCstar(params.ssoUserId, params.accessToken);
    await Promise.all([setUiTenantRoles(params.email, roles), setUiTenantGroups(params.email, groups)]);
  }

  /**
   * @deprecated Use prewarmTenantRolesAndGroups instead.
   */
  async prewarmTenantRoles(params: { email: string; ssoUserId: string; accessToken: string }): Promise<void> {
    return this.prewarmTenantRolesAndGroups(params);
  }

  /**
   * Invalidates the cached tenant roles and groups for a user (e.g. on token refresh).
   */
  async invalidateTenantRolesAndGroups(email: string): Promise<void> {
    await Promise.all([invalidateTenantRoles(email), invalidateTenantGroups(email)]);
  }

  /**
   * @deprecated Use invalidateTenantRolesAndGroups instead.
   */
  async invalidateTenantRoles(email: string): Promise<void> {
    return this.invalidateTenantRolesAndGroups(email);
  }

  /**
   * Fetches groups with roles from CSTAR for all tenants and returns both
   * TenantRole[] and TenantGroup[] derived from a single getUserGroupsWithRoles call per tenant.
   */
  private async fetchTenantRolesAndGroupsFromCstar(
    ssoUserId: string,
    accessToken: string,
  ): Promise<{ roles: TenantRole[]; groups: TenantGroup[] }> {
    const tenants = await this.cstarService.getUserTenants({ ssoUserId, accessToken });
    if (tenants.length === 0) {
      return { roles: [], groups: [] };
    }

    const results = await Promise.allSettled(
      tenants.map(async (tenant) => {
        const userGroups = await this.cstarService.getUserGroupsWithRoles({
          tenantId: tenant.id,
          ssoUserId,
          accessToken,
        });

        // Extract unique role names from all groups' sharedServiceRoles
        const roleNameSet = new Set<string>();
        for (const group of userGroups) {
          for (const role of group.sharedServiceRoles) {
            roleNameSet.add(role.name);
          }
        }

        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          roleNames: [...roleNameSet],
          groupNames: userGroups.map((g) => g.name),
        };
      }),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const rejected = results.filter((r) => r.status === 'rejected');

    if (rejected.length > 0) {
      log.warn('Some tenant roles/groups fetches failed', {
        ssoUserId,
        failedCount: rejected.length,
        totalCount: tenants.length,
      });
    }

    const roles: TenantRole[] = fulfilled.map((f) => ({
      tenantId: f.tenantId,
      tenantName: f.tenantName,
      roles: f.roleNames,
    }));

    const groups: TenantGroup[] = fulfilled.map((f) => ({
      tenantId: f.tenantId,
      tenantName: f.tenantName,
      groups: f.groupNames,
    }));

    return { roles, groups };
  }

  private async fetchTenantRolesFromCstar(ssoUserId: string, accessToken: string): Promise<TenantRole[]> {
    const { roles } = await this.fetchTenantRolesAndGroupsFromCstar(ssoUserId, accessToken);
    return roles;
  }

  private async fetchTenantGroupsFromCstar(ssoUserId: string, accessToken: string): Promise<TenantGroup[]> {
    const { groups } = await this.fetchTenantRolesAndGroupsFromCstar(ssoUserId, accessToken);
    return groups;
  }
}
