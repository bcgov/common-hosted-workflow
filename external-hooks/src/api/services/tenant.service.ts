import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CstarService } from './cstar.service';

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
}
