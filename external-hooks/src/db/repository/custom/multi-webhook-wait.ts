import { and, eq, sql } from 'drizzle-orm';
import {
  multiWebhookWait,
  multiWebhookWaitCall,
  type MultiWebhookWait,
  type MultiWebhookWaitCall,
} from '../../schema/multi-webhook-wait';

export interface RegisterWaitParams {
  executionId: string;
  resumeUrl: string;
  expectedCalls: Array<{ matchKey: string }>;
}

export interface MarkCallReceivedParams {
  executionId: string;
  matchKey: string;
  payload: unknown;
}

export class MultiWebhookWaitRepository {
  constructor(private readonly db: any) {}

  /**
   * Registers a new multi-webhook wait group with its expected calls.
   * If a wait already exists for this execution, it is replaced (delete + re-insert).
   */
  async registerWait(params: RegisterWaitParams): Promise<MultiWebhookWait> {
    const { executionId, resumeUrl, expectedCalls } = params;
    const now = new Date();

    // Delete any existing wait for this execution (cascade removes child rows)
    await this.db.delete(multiWebhookWait).where(eq(multiWebhookWait.executionId, executionId));

    // Insert the parent wait row
    const [waitRow] = await this.db
      .insert(multiWebhookWait)
      .values({
        executionId,
        resumeUrl,
        totalExpected: expectedCalls.length,
        totalReceived: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Insert all expected call rows
    if (expectedCalls.length > 0) {
      await this.db.insert(multiWebhookWaitCall).values(
        expectedCalls.map((call) => ({
          executionId,
          matchKey: call.matchKey,
          received: false,
          receivedAt: null,
          payload: null,
          createdAt: now,
        })),
      );
    }

    return waitRow;
  }

  /** Returns the wait row for an execution, or null if not found. */
  async getByExecutionId(executionId: string): Promise<MultiWebhookWait | null> {
    const [row] = await this.db
      .select()
      .from(multiWebhookWait)
      .where(eq(multiWebhookWait.executionId, executionId))
      .limit(1);
    return row ?? null;
  }

  /** Returns all call rows for an execution. */
  async getCallsByExecutionId(executionId: string): Promise<MultiWebhookWaitCall[]> {
    return await this.db.select().from(multiWebhookWaitCall).where(eq(multiWebhookWaitCall.executionId, executionId));
  }

  /**
   * Marks a specific expected call as received, stores the payload, and
   * atomically increments the parent's total_received counter.
   *
   * Both operations run in a single transaction to prevent desync between
   * the call row state and the parent counter on crash.
   *
   * Returns the updated parent wait row, or null if the call was already
   * received or doesn't exist.
   */
  async markCallReceived(params: MarkCallReceivedParams): Promise<MultiWebhookWait | null> {
    const { executionId, matchKey, payload } = params;
    const now = new Date();

    return await this.db.transaction(async (tx: any) => {
      // Only update if not already received (idempotent)
      const [updatedCall] = await tx
        .update(multiWebhookWaitCall)
        .set({
          received: true,
          receivedAt: now,
          payload,
        })
        .where(
          and(
            eq(multiWebhookWaitCall.executionId, executionId),
            eq(multiWebhookWaitCall.matchKey, matchKey),
            eq(multiWebhookWaitCall.received, false),
          ),
        )
        .returning();

      if (!updatedCall) {
        return null; // Already received or doesn't exist
      }

      // Atomically increment the parent counter (same transaction)
      const [updatedWait] = await tx
        .update(multiWebhookWait)
        .set({
          totalReceived: sql`${multiWebhookWait.totalReceived} + 1`,
          updatedAt: now,
        })
        .where(eq(multiWebhookWait.executionId, executionId))
        .returning();

      return updatedWait ?? null;
    });
  }

  /** Deletes the wait group and all its calls (cascade). Returns the deleted parent or null. */
  async deleteWait(executionId: string): Promise<MultiWebhookWait | null> {
    const [row] = await this.db
      .delete(multiWebhookWait)
      .where(eq(multiWebhookWait.executionId, executionId))
      .returning();
    return row ?? null;
  }
}
