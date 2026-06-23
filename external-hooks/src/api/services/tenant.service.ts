import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CstarService } from './cstar.service';
import type { TenantRole } from '../helpers/ui-oidc-store';
import { resolveTenantRoles, invalidateTenantRoles } from '../helpers/tenant-roles';
import { setUiTenantRoles } from '../helpers/ui-oidc-store';
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
   */
  async getTenantRolesForSession(params: {
    email: string;
    ssoUserId: string;
    accessToken?: string;
  }): Promise<TenantRole[]> {
    if (!this.cstarService.isConfigured()) {
      return [];
    }

    return resolveTenantRoles({
      email: params.email,
      ssoUserId: params.ssoUserId,
      accessToken: params.accessToken,
      fetchFn: (ssoUserId, accessToken) => this.fetchTenantRolesFromCstar(ssoUserId, accessToken),
    });
  }

  /**
   * Pre-warms the tenant roles cache at login time.
   * Throws on failure — caller is responsible for error handling.
   */
  async prewarmTenantRoles(params: { email: string; ssoUserId: string; accessToken: string }): Promise<void> {
    if (!this.cstarService.isConfigured()) {
      return;
    }

    const tenantRoles = await this.fetchTenantRolesFromCstar(params.ssoUserId, params.accessToken);
    await setUiTenantRoles(params.email, tenantRoles);
  }

  /**
   * Invalidates the cached tenant roles for a user (e.g. on token refresh).
   */
  async invalidateTenantRoles(email: string): Promise<void> {
    await invalidateTenantRoles(email);
  }

  private async fetchTenantRolesFromCstar(ssoUserId: string, accessToken: string): Promise<TenantRole[]> {
    const tenants = await this.cstarService.getUserTenants({ ssoUserId, accessToken });
    if (tenants.length === 0) {
      return [];
    }

    const results = await Promise.allSettled(
      tenants.map(async (tenant) => {
        const roles = await this.cstarService.getUserSharedServiceRoles({
          tenantId: tenant.id,
          ssoUserId,
          accessToken,
        });
        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          roles: roles.map((r) => r.name),
        } satisfies TenantRole;
      }),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const rejected = results.filter((r) => r.status === 'rejected');

    if (rejected.length > 0) {
      log.warn('Some tenant role fetches failed', {
        ssoUserId,
        failedCount: rejected.length,
        totalCount: tenants.length,
      });
    }

    return fulfilled;
  }
}
