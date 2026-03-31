import { eq } from 'drizzle-orm';
import { tenantProjectRelation } from '../../schema/workflow-interaction-layer';

export class TenantProjectRelationRepository {
  constructor(private readonly db: any) {}

  /** Returns all project IDs linked to a tenant in `tenant_project_relation`. */
  async getProjectIdsByTenantId(tenantId: string): Promise<string[]> {
    const rows = await this.db
      .select({ projectId: tenantProjectRelation.projectId })
      .from(tenantProjectRelation)
      .where(eq(tenantProjectRelation.tenantId, tenantId));
    return rows.map((r: { projectId: string }) => r.projectId);
  }

  /** Lightweight existence check used before inserting message rows with derived projectId. */
  async hasProjectId(projectId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ projectId: tenantProjectRelation.projectId })
      .from(tenantProjectRelation)
      .where(eq(tenantProjectRelation.projectId, projectId))
      .limit(1);
    return Boolean(row);
  }

  /**
   * Inserts a tenant/project mapping into `tenant_project_relation`.
   * - At most one project per tenant: if the tenant already has any mapping to a different projectId,
   *   returns { conflictProjectId } (existing project id) and does not insert.
   * - If the exact (tenantId, projectId) already exists -> returns { created: false }.
   * - If the projectId is already mapped to a different tenant -> returns { conflictTenantId }.
   */
  async insertTenantProjectRelation(params: {
    tenantId: string;
    projectId: string;
  }): Promise<{ created: boolean; conflictTenantId?: string; conflictProjectId?: string }> {
    const { tenantId, projectId } = params;

    const tenantProjectIds = await this.getProjectIdsByTenantId(tenantId);
    if (tenantProjectIds.length > 0) {
      if (tenantProjectIds.includes(projectId)) {
        return { created: false };
      }
      return { created: false, conflictProjectId: tenantProjectIds[0] };
    }

    const existingByProject = await this.db
      .select({ tenantId: tenantProjectRelation.tenantId })
      .from(tenantProjectRelation)
      .where(eq(tenantProjectRelation.projectId, projectId))
      .limit(1);

    if (existingByProject[0]?.tenantId) {
      const existingTenantId = existingByProject[0].tenantId;
      if (existingTenantId === tenantId) return { created: false };
      return { created: false, conflictTenantId: existingTenantId };
    }

    await this.db.insert(tenantProjectRelation).values({ tenantId, projectId });
    return { created: true };
  }
}
