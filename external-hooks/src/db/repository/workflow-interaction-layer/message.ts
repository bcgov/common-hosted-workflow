import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { messages, tenantProjectRelation } from '../../schema/workflow-interaction-layer';

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

export class MessageRepository {
  constructor(private readonly db: any) {}

  /** List messages within allowed project scope with optional actor/since filters. */
  async list(params: {
    allowedProjectIds: string[];
    actorId?: string;
    since?: Date;
    limit: number;
  }): Promise<Array<typeof messages.$inferSelect>> {
    const clauses: any[] = [inArray(messages.projectId, params.allowedProjectIds)];
    if (params.actorId) clauses.push(eq(messages.actorId, params.actorId));
    // "since" means created at or after the provided timestamp.
    if (params.since) clauses.push(gte(messages.createdAt, params.since));

    return await this.db
      .select()
      .from(messages)
      .where(and(...clauses))
      .orderBy(desc(messages.createdAt))
      .limit(params.limit);
  }

  /** Creates a new message row in the custom workflow-interaction-layer schema. */
  async create(input: {
    title: string;
    body: string;
    actorId: string;
    actorType: string;
    workflowInstanceId: string;
    workflowId: string;
    projectId: string;
    metadata: Record<string, unknown> | null;
    status: string;
  }): Promise<typeof messages.$inferSelect> {
    const now = new Date();
    const [row] = await this.db
      .insert(messages)
      .values({
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  }
}
