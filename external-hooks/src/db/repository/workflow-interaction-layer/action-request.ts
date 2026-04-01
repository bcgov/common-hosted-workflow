import { and, desc, eq, gte, inArray, lt, or } from 'drizzle-orm';
import type { ListPaginationSince } from '../../../types/list-pagination';
import { actionRequests } from '../../schema/workflow-interaction-layer';

export class ActionRequestRepository {
  constructor(private readonly db: any) {}

  /** List action requests within allowed project scope and optional filters. */
  async list(params: {
    allowedProjectIds: string[];
    actorId?: string;
    paginationSince?: ListPaginationSince;
    workflowInstanceId?: string;
    limit: number;
  }): Promise<Array<typeof actionRequests.$inferSelect>> {
    const clauses: any[] = [inArray(actionRequests.projectId, params.allowedProjectIds)];
    if (params.actorId) clauses.push(eq(actionRequests.actorId, params.actorId));
    const ps = params.paginationSince;
    if (ps?.mode === 'time') {
      if (!Number.isNaN(ps.since.getTime())) {
        clauses.push(gte(actionRequests.createdAt, ps.since));
      }
    } else if (ps?.mode === 'cursor') {
      clauses.push(
        or(
          lt(actionRequests.createdAt, ps.createdAt),
          and(eq(actionRequests.createdAt, ps.createdAt), lt(actionRequests.id, ps.id)),
        ),
      );
    }
    if (params.workflowInstanceId) clauses.push(eq(actionRequests.workflowInstanceId, params.workflowInstanceId));

    // `id` tie-breaker: stable total order for keyset cursor (WHERE above must match this sort).
    return await this.db
      .select()
      .from(actionRequests)
      .where(and(...clauses))
      .orderBy(desc(actionRequests.createdAt), desc(actionRequests.id))
      .limit(params.limit);
  }

  /** Returns one action request by id within allowed project scope. */
  async getById(params: {
    allowedProjectIds: string[];
    actionId: string;
    actorId?: string;
  }): Promise<typeof actionRequests.$inferSelect | null> {
    const clauses: any[] = [
      inArray(actionRequests.projectId, params.allowedProjectIds),
      eq(actionRequests.id, params.actionId),
    ];
    if (params.actorId) clauses.push(eq(actionRequests.actorId, params.actorId));

    const [row] = await this.db
      .select()
      .from(actionRequests)
      .where(and(...clauses))
      .limit(1);
    return row ?? null;
  }

  /** Creates a new action request row in the custom workflow-interaction-layer schema. */
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

  /** Updates status by id and project scope (optionally actor-scoped). */
  async updateStatus(params: {
    allowedProjectIds: string[];
    actionId: string;
    status: string;
    actorId?: string;
  }): Promise<boolean> {
    const clauses: any[] = [
      inArray(actionRequests.projectId, params.allowedProjectIds),
      eq(actionRequests.id, params.actionId),
    ];
    if (params.actorId) clauses.push(eq(actionRequests.actorId, params.actorId));

    const rows = await this.db
      .update(actionRequests)
      .set({
        status: params.status,
        updatedAt: new Date(),
      })
      .where(and(...clauses))
      .returning({ id: actionRequests.id });
    return rows.length > 0;
  }
}
