import { and, desc } from 'drizzle-orm';
import { message } from '../../schema/workflow-interaction-layer';

export class MessageRepository {
  constructor(private readonly db: any) {}

  /** List messages matching the provided where clauses. */
  async list(params: { where: any[]; limit: number }): Promise<Array<typeof message.$inferSelect>> {
    return await this.db
      .select()
      .from(message)
      .where(and(...params.where))
      .orderBy(desc(message.createdAt), desc(message.id))
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
  }): Promise<typeof message.$inferSelect> {
    const now = new Date();
    const [row] = await this.db
      .insert(message)
      .values({
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  }
}
