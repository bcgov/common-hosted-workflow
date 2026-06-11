import { eq } from 'drizzle-orm';
import { tenantProjectRelation } from '../../schema/workflow-interaction-layer';

export class TenantProjectRelationRepository {
  constructor(private readonly db: any) {}

  /** Returns all project IDs linked to a tenant. */
  async getProjectIdsByTenantId(tenantId: string): Promise<string[]> {
    const rows = await this.db
      .select({ projectId: tenantProjectRelation.projectId })
      .from(tenantProjectRelation)
      .where(eq(tenantProjectRelation.tenantId, tenantId));
    return rows.map((r: { projectId: string }) => r.projectId);
  }

  /** Returns the tenantId mapped to a projectId, or null if unmapped. */
  async getTenantIdByProjectId(projectId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ tenantId: tenantProjectRelation.tenantId })
      .from(tenantProjectRelation)
      .where(eq(tenantProjectRelation.projectId, projectId))
      .limit(1);
    return row?.tenantId ?? null;
  }

  /** Returns all distinct tenant IDs from the relation table. */
  async listDistinctTenantIds(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ tenantId: tenantProjectRelation.tenantId }).from(tenantProjectRelation);
    return rows.map((r: { tenantId: string }) => r.tenantId);
  }

  /** Inserts a tenant/project mapping. Caller must handle unique constraint violations. */
  async insert(params: { tenantId: string; projectId: string }): Promise<void> {
    await this.db.insert(tenantProjectRelation).values(params);
  }
}
