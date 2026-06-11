import type { CustomRepositories } from '../bootstrap/custom-repositories';

export type TenantListItem = {
  id: string;
  name: string;
};

export class TenantService {
  constructor(private readonly customRepositories: CustomRepositories) {}

  /**
   * Returns all tenants from the tenant_project_relation table.
   * Names are synthetic placeholders until CSTAR integration provides real names.
   */
  async listTenants(): Promise<TenantListItem[]> {
    const tenantIds = await this.customRepositories.tenantProjectRelation.listDistinctTenantIds();

    return tenantIds.map((id, index) => ({
      id,
      name: `Tenant ${index + 1}`,
    }));
  }
}
