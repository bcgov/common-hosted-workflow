import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { accessRequest } from '../../schema/access-request';

function buildWhereClause(where: SQL[]) {
  return where.length > 0 ? and(...where) : undefined;
}

export class AccessRequestRepository {
  constructor(private readonly db: any) {}

  async list(params: {
    where: SQL[];
    limit: number;
    offset?: number;
  }): Promise<Array<typeof accessRequest.$inferSelect>> {
    const { where, limit, offset = 0 } = params;
    return await this.db
      .select()
      .from(accessRequest)
      .where(buildWhereClause(where))
      .orderBy(desc(accessRequest.createdAt), desc(accessRequest.id))
      .limit(limit)
      .offset(offset);
  }

  async count(where: SQL[]): Promise<number> {
    const [{ cnt }] = await this.db.select({ cnt: count() }).from(accessRequest).where(buildWhereClause(where));
    return Number(cnt);
  }

  async getById(accessRequestId: string): Promise<typeof accessRequest.$inferSelect | null> {
    const [row] = await this.db.select().from(accessRequest).where(eq(accessRequest.id, accessRequestId)).limit(1);
    return row ?? null;
  }

  async getPendingByRequesterEmail(email: string): Promise<typeof accessRequest.$inferSelect | null> {
    const [row] = await this.db
      .select()
      .from(accessRequest)
      .where(and(eq(accessRequest.requesterEmail, email), eq(accessRequest.status, 'pending')))
      .limit(1);
    return row ?? null;
  }

  async getLatestByRequesterEmail(email: string): Promise<typeof accessRequest.$inferSelect | null> {
    const [row] = await this.db
      .select()
      .from(accessRequest)
      .where(eq(accessRequest.requesterEmail, email))
      .orderBy(desc(accessRequest.updatedAt), desc(accessRequest.createdAt), desc(accessRequest.id))
      .limit(1);
    return row ?? null;
  }

  async create(input: {
    requesterEmail: string;
    justification: string;
    status: string;
    metadata: Record<string, unknown> | null;
  }): Promise<typeof accessRequest.$inferSelect> {
    const now = new Date();
    const [row] = await this.db
      .insert(accessRequest)
      .values({
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  }

  async updateStatus(params: {
    accessRequestId: string;
    status: string;
    currentStatus?: string;
    reviewerEmail?: string;
    reviewerN8nUserId?: string;
    denyReason?: string;
  }): Promise<typeof accessRequest.$inferSelect | null> {
    const updateData: Record<string, any> = {
      status: params.status,
      updatedAt: new Date(),
    };
    if (params.reviewerEmail !== undefined) updateData.reviewerEmail = params.reviewerEmail;
    if (params.reviewerN8nUserId !== undefined) updateData.reviewerN8nUserId = params.reviewerN8nUserId;
    if (params.denyReason !== undefined) updateData.denyReason = params.denyReason;

    const [row] = await this.db
      .update(accessRequest)
      .set(updateData)
      .where(
        and(
          eq(accessRequest.id, params.accessRequestId),
          ...(params.currentStatus ? [eq(accessRequest.status, params.currentStatus)] : []),
        ),
      )
      .returning();
    return row ?? null;
  }
}
