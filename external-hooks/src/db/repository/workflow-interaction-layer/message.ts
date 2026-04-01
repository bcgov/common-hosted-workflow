import { and, desc, eq, gte, inArray, lt, or } from 'drizzle-orm';
import type { ListPaginationSince } from '../../../types/list-pagination';
import { messages } from '../../schema/workflow-interaction-layer';

export class MessageRepository {
  constructor(private readonly db: any) {}

  /** List messages within allowed project scope with optional filters and `paginationSince` (time or keyset). */
  async list(params: {
    allowedProjectIds: string[];
    actorId?: string;
    paginationSince?: ListPaginationSince;
    workflowInstanceId?: string;
    limit: number;
  }): Promise<Array<typeof messages.$inferSelect>> {
    const clauses: any[] = [inArray(messages.projectId, params.allowedProjectIds)];
    if (params.actorId) clauses.push(eq(messages.actorId, params.actorId));
    if (params.workflowInstanceId) clauses.push(eq(messages.workflowInstanceId, params.workflowInstanceId));
    const ps = params.paginationSince;
    if (ps?.mode === 'time') {
      if (!Number.isNaN(ps.since.getTime())) {
        clauses.push(gte(messages.createdAt, ps.since));
      }
    } else if (ps?.mode === 'cursor') {
      clauses.push(
        or(lt(messages.createdAt, ps.createdAt), and(eq(messages.createdAt, ps.createdAt), lt(messages.id, ps.id))),
      );
    }

    // `id` tie-breaker: stable total order for keyset cursor (WHERE above must match this sort).
    return await this.db
      .select()
      .from(messages)
      .where(and(...clauses))
      .orderBy(desc(messages.createdAt), desc(messages.id))
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
