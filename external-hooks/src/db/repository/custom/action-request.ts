import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { actionRequest, type ActionRequest } from '../../schema/workflow-interaction-layer';

export class ActionRequestRepository {
  constructor(private readonly db: any) {}

  /** List action requests matching the provided where clauses. */
  async list(params: { where: any[]; limit: number }): Promise<ActionRequest[]> {
    return await this.db
      .select()
      .from(actionRequest)
      .where(and(...params.where))
      .orderBy(desc(actionRequest.createdAt), desc(actionRequest.id))
      .limit(params.limit);
  }

  /** Returns counts grouped by status for actions matching the provided where clauses. */
  async countByStatus(params: { where: any[] }): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ status: actionRequest.status, count: count() })
      .from(actionRequest)
      .where(and(...params.where))
      .groupBy(actionRequest.status);

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.status] = Number(row.count);
    }
    return result;
  }

  /** Returns one action request by id, optionally scoped by where clauses. */
  async getById(params: { actionId: string; where?: any[] }): Promise<ActionRequest | null> {
    const clauses = [eq(actionRequest.id, params.actionId), ...(params.where ?? [])];
    const [row] = await this.db
      .select()
      .from(actionRequest)
      .where(and(...clauses))
      .limit(1);
    return row ?? null;
  }

  /** Creates a new action request row. */
  async create(input: {
    actionType: string;
    actionTitle?: string | null;
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
  }): Promise<ActionRequest> {
    const now = new Date();
    const [row] = await this.db
      .insert(actionRequest)
      .values({
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  }

  /** Updates status by id with optimistic locking and optional additional fields. */
  async updateStatus(params: {
    actionId: string;
    status: string;
    expectedStatus?: string;
    additionalFields?: {
      completedBy?: string;
      completedAt?: Date;
    };
    where?: any[];
  }): Promise<ActionRequest | null> {
    const clauses = [
      eq(actionRequest.id, params.actionId),
      ...(params.expectedStatus ? [eq(actionRequest.status, params.expectedStatus)] : []),
      ...(params.where ?? []),
    ];
    const setValues: Record<string, any> = {
      status: params.status,
      updatedAt: new Date(),
      ...(params.additionalFields ?? {}),
    };
    const [row] = await this.db
      .update(actionRequest)
      .set(setValues)
      .where(and(...clauses))
      .returning();
    return row ?? null;
  }

  /** Atomically claims an action (pending → claimed). Returns updated row or null if preconditions not met. */
  async claim(params: { actionId: string; claimedBy: string; where?: SQL[] }): Promise<ActionRequest | null> {
    const clauses = [
      eq(actionRequest.id, params.actionId),
      eq(actionRequest.status, 'pending'),
      ...(params.where ?? []),
    ];
    const [row] = await this.db
      .update(actionRequest)
      .set({
        status: 'claimed',
        claimedBy: params.claimedBy,
        claimedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(...clauses))
      .returning();
    return row ?? null;
  }

  /** Atomically unclaims an action (claimed|in_progress → pending). Returns updated row or null if preconditions not met. */
  async unclaim(params: { actionId: string; where?: SQL[] }): Promise<ActionRequest | null> {
    const clauses = [
      eq(actionRequest.id, params.actionId),
      inArray(actionRequest.status, ['claimed', 'in_progress']),
      ...(params.where ?? []),
    ];
    const [row] = await this.db
      .update(actionRequest)
      .set({
        status: 'pending',
        claimedBy: null,
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(and(...clauses))
      .returning();
    return row ?? null;
  }

  /** Atomically starts an action (claimed → in_progress). Returns updated row or null if preconditions not met. */
  async startAction(params: { actionId: string; claimedBy: string; where?: SQL[] }): Promise<ActionRequest | null> {
    const clauses = [
      eq(actionRequest.id, params.actionId),
      eq(actionRequest.status, 'claimed'),
      eq(actionRequest.claimedBy, params.claimedBy),
      ...(params.where ?? []),
    ];
    const [row] = await this.db
      .update(actionRequest)
      .set({
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .where(and(...clauses))
      .returning();
    return row ?? null;
  }

  /** Directly updates any combination of fields without state machine validation.
   *  Used by the WIL API (trusted service account) to set claim/completion fields directly. */
  async directUpdate(params: {
    actionId: string;
    setValues: Record<string, any>;
    where?: SQL[];
  }): Promise<ActionRequest | null> {
    const clauses = [eq(actionRequest.id, params.actionId), ...(params.where ?? [])];
    const [row] = await this.db
      .update(actionRequest)
      .set(params.setValues)
      .where(and(...clauses))
      .returning();
    return row ?? null;
  }
}
