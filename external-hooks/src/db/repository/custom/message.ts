import { and, desc, eq } from 'drizzle-orm';
import { message } from '../../schema/workflow-interaction-layer';

export class MessageRepository {
  constructor(private readonly db: any) {}

  /**
   * List messages matching the provided where clauses.
   *
   * Fetches one extra row beyond `limit` so callers can detect whether
   * another page exists without guessing from `rows.length === limit`
   * (which is wrong whenever the result set ends exactly on a page boundary).
   * Callers should trim the result via `paginateOverfetchedRows`.
   */
  async list(params: { where: any[]; limit: number }): Promise<Array<typeof message.$inferSelect>> {
    return await this.db
      .select()
      .from(message)
      .where(and(...params.where))
      .orderBy(desc(message.createdAt), desc(message.id))
      .limit(params.limit + 1);
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

  /** Deletes all messages for a project. */
  async deleteByProjectId(projectId: string): Promise<void> {
    await this.db.delete(message).where(eq(message.projectId, projectId));
  }
}
