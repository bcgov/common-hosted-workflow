import { and, desc, eq, inArray } from 'drizzle-orm';
import { workflowTrigger } from '../../schema/workflow-trigger';

export class WorkflowTriggerRepository {
  constructor(private readonly db: any) {}

  /** List workflow triggers matching the provided where clauses. */
  async list(params: { where: any[]; limit: number }): Promise<Array<typeof workflowTrigger.$inferSelect>> {
    return await this.db
      .select()
      .from(workflowTrigger)
      .where(and(...params.where))
      .orderBy(desc(workflowTrigger.createdAt), desc(workflowTrigger.id))
      .limit(params.limit);
  }

  /** Returns one workflow trigger by id, optionally scoped by where clauses. */
  async getById(params: { triggerId: string; where?: any[] }): Promise<typeof workflowTrigger.$inferSelect | null> {
    const clauses = [eq(workflowTrigger.id, params.triggerId), ...(params.where ?? [])];
    const [row] = await this.db
      .select()
      .from(workflowTrigger)
      .where(and(...clauses))
      .limit(1);
    return row ?? null;
  }

  /** Creates a new workflow trigger row. */
  async create(input: {
    projectId: string;
    triggerType: string;
    triggerUrl: string;
    triggerMethod: string;
    metadata: Record<string, unknown>;
    allowedActorsType: string;
    allowedActors: string[];
    authEnabled?: boolean;
    createdBy?: string | null;
  }): Promise<typeof workflowTrigger.$inferSelect> {
    const now = new Date();
    const [row] = await this.db
      .insert(workflowTrigger)
      .values({
        projectId: input.projectId,
        triggerType: input.triggerType,
        triggerUrl: input.triggerUrl,
        triggerMethod: input.triggerMethod,
        metadata: input.metadata,
        allowedActorsType: input.allowedActorsType,
        allowedActors: input.allowedActors,
        authEnabled: input.authEnabled ?? false,
        createdBy: input.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  }

  /** Updates all mutable fields (except triggerType) by id. */
  async update(params: {
    triggerId: string;
    triggerUrl: string;
    triggerMethod: string;
    metadata: Record<string, unknown>;
    allowedActorsType: string;
    allowedActors: string[];
    authEnabled: boolean;
    updatedBy: string;
    where?: any[];
  }): Promise<typeof workflowTrigger.$inferSelect | null> {
    const clauses = [eq(workflowTrigger.id, params.triggerId), ...(params.where ?? [])];
    const [row] = await this.db
      .update(workflowTrigger)
      .set({
        triggerUrl: params.triggerUrl,
        triggerMethod: params.triggerMethod,
        metadata: params.metadata,
        allowedActorsType: params.allowedActorsType,
        allowedActors: params.allowedActors,
        authEnabled: params.authEnabled,
        updatedAt: new Date(),
        updatedBy: params.updatedBy,
      })
      .where(and(...clauses))
      .returning();
    return row ?? null;
  }

  /** Deletes one workflow trigger by id. Returns the deleted row or null. */
  async deleteById(params: { triggerId: string; where?: any[] }): Promise<typeof workflowTrigger.$inferSelect | null> {
    const clauses = [eq(workflowTrigger.id, params.triggerId), ...(params.where ?? [])];
    const [row] = await this.db
      .delete(workflowTrigger)
      .where(and(...clauses))
      .returning();
    return row ?? null;
  }

  /** Returns all trigger IDs for a list of project IDs. */
  async listIdsByProjectIds(projectIds: string[]): Promise<string[]> {
    const rows = await this.db
      .select({ id: workflowTrigger.id })
      .from(workflowTrigger)
      .where(inArray(workflowTrigger.projectId, projectIds));
    return rows.map((r: { id: string }) => r.id);
  }
}
