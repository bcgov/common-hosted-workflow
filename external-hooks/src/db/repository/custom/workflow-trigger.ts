import { and, desc, eq } from 'drizzle-orm';
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

  /** Updates allowed_actors_type and allowed_actors by id. Also sets updated_at and updated_by. */
  async updateAllowedActors(params: {
    triggerId: string;
    allowedActorsType: string;
    allowedActors: string[];
    updatedBy: string;
    where?: any[];
  }): Promise<typeof workflowTrigger.$inferSelect | null> {
    const clauses = [eq(workflowTrigger.id, params.triggerId), ...(params.where ?? [])];
    const [row] = await this.db
      .update(workflowTrigger)
      .set({
        allowedActorsType: params.allowedActorsType,
        allowedActors: params.allowedActors,
        updatedAt: new Date(),
        updatedBy: params.updatedBy,
      })
      .where(and(...clauses))
      .returning();
    return row ?? null;
  }

  /** Updates auth_enabled by id. Also sets updated_at and updated_by. Returns the updated row or null. */
  async updateAuthEnabled(params: {
    triggerId: string;
    authEnabled: boolean;
    updatedBy: string;
    where?: any[];
  }): Promise<typeof workflowTrigger.$inferSelect | null> {
    const clauses = [eq(workflowTrigger.id, params.triggerId), ...(params.where ?? [])];
    const [row] = await this.db
      .update(workflowTrigger)
      .set({
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
}
