import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { messages } from '../../schema/workflow-interaction-layer';

export class MessageRepository {
  constructor(private readonly db: any) {}

  /** List messages within allowed project scope with optional actor/since filters. */
  async list(params: {
    allowedProjectIds: string[];
    actorId?: string;
    since?: Date;
    workflowInstanceId?: string;
    limit: number;
  }): Promise<Array<typeof messages.$inferSelect>> {
    const clauses: any[] = [inArray(messages.projectId, params.allowedProjectIds)];
    if (params.actorId) clauses.push(eq(messages.actorId, params.actorId));
    if (params.workflowInstanceId) clauses.push(eq(messages.workflowInstanceId, params.workflowInstanceId));
    // "since" means createdAt >= provided instant (exclusive of invalid Date).
    if (params.since instanceof Date && !Number.isNaN(params.since.getTime())) {
      clauses.push(gte(messages.createdAt, params.since));
    }

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
