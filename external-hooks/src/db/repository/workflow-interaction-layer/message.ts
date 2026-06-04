import { and, desc } from 'drizzle-orm';
import { messages } from '../../schema/workflow-interaction-layer';

export class MessageRepository {
  constructor(private readonly db: any) {}

  /** List messages matching the provided where clauses. */
  async list(params: { where: any[]; limit: number }): Promise<Array<typeof messages.$inferSelect>> {
    return await this.db
      .select()
      .from(messages)
      .where(and(...params.where))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(params.limit);
  }

  /** Creates a new message row. */
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
