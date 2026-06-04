import { and, desc, eq } from 'drizzle-orm';
import { actionRequests } from '../../schema/workflow-interaction-layer';

export class ActionRequestRepository {
  constructor(private readonly db: any) {}

  /** List action requests matching the provided where clauses. */
  async list(params: { where: any[]; limit: number }): Promise<Array<typeof actionRequests.$inferSelect>> {
    return await this.db
      .select()
      .from(actionRequests)
      .where(and(...params.where))
      .orderBy(desc(actionRequests.createdAt), desc(actionRequests.id))
      .limit(params.limit);
  }

  /** Returns one action request by id, optionally scoped by where clauses. */
  async getById(params: { actionId: string; where?: any[] }): Promise<typeof actionRequests.$inferSelect | null> {
    const clauses = [eq(actionRequests.id, params.actionId), ...(params.where ?? [])];
    const [row] = await this.db
      .select()
      .from(actionRequests)
      .where(and(...clauses))
      .limit(1);
    return row ?? null;
  }

  /** Creates a new action request row. */
  async create(input: {
    actionType: string;
    payload: Record<string, unknown>;
    callbackUrl: string;
    callbackMethod: string;
    callbackPayloadSpec: Record<string, unknown> | null;
    actorId: string;
    actorType: string;
    workflowInstanceId: string;
    workflowId: string;
    projectId: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    checkIn: Date | null;
    metadata: Record<string, unknown> | null;
  }): Promise<typeof actionRequests.$inferSelect> {
    const now = new Date();
    const [row] = await this.db
      .insert(actionRequests)
      .values({
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  }

  /** Updates status by id, optionally scoped by where clauses. Returns the updated row or null. */
  async updateStatus(params: {
    actionId: string;
    status: string;
    where?: any[];
  }): Promise<typeof actionRequests.$inferSelect | null> {
    const clauses = [eq(actionRequests.id, params.actionId), ...(params.where ?? [])];
    const [row] = await this.db
      .update(actionRequests)
      .set({
        status: params.status,
        updatedAt: new Date(),
      })
      .where(and(...clauses))
      .returning();
    return row ?? null;
  }
}
