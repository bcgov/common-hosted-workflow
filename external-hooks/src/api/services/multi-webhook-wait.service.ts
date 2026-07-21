import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { MultiWebhookWaitCall } from '../../db/schema/multi-webhook-wait';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';

const log = createLogger('MultiWebhookWaitService');

export interface RegisterMultiWaitInput {
  executionId: string;
  resumeUrl: string;
  expectedCalls: Array<{ matchKey: string }>;
}

export interface MarkCallReceivedInput {
  executionId: string;
  matchKey: string;
  payload: unknown;
}

export interface MarkCallReceivedResult {
  /** Whether this specific call was newly marked (false if already received or unknown). */
  accepted: boolean;
  /** Whether all expected calls have now been received. */
  allReceived: boolean;
  /** Current count of received calls. */
  totalReceived: number;
  /** Total expected calls. */
  totalExpected: number;
  /** Pending match keys that haven't been received yet. */
  pending: string[];
  /** The resume URL to fire when all calls are received (only present when allReceived=true). */
  resumeUrl: string | null;
  /** All call data (only present when allReceived=true for cleanup by the route). */
  calls: MultiWebhookWaitCall[] | null;
}

export class MultiWebhookWaitService {
  constructor(private readonly customRepositories: CustomRepositories) {}

  /**
   * Registers a new multi-webhook wait for an execution.
   * Replaces any existing wait for the same execution (idempotent for retries).
   */
  async register(input: RegisterMultiWaitInput): Promise<void> {
    const { executionId, resumeUrl, expectedCalls } = input;

    if (expectedCalls.length < 1) {
      throw new AppError(400, 'At least one expected call must be defined');
    }

    // Validate no duplicate match keys
    const keys = new Set(expectedCalls.map((c) => c.matchKey));
    if (keys.size !== expectedCalls.length) {
      throw new AppError(400, 'Duplicate match keys are not allowed');
    }

    log.debug('Registering multi-webhook wait', { executionId, totalExpected: expectedCalls.length });

    await this.customRepositories.multiWebhookWait.registerWait({
      executionId,
      resumeUrl,
      expectedCalls,
    });
  }

  /**
   * Marks an individual callback as received and checks for completion.
   *
   * Returns a result indicating whether the call was accepted, whether all calls
   * are now received, and (when complete) the aggregated call data + resume URL.
   */
  async markCallReceived(input: MarkCallReceivedInput): Promise<MarkCallReceivedResult> {
    const { executionId, matchKey, payload } = input;

    const waitRow = await this.customRepositories.multiWebhookWait.getByExecutionId(executionId);
    if (!waitRow) {
      throw new AppError(404, 'No pending multi-webhook wait found for this execution');
    }

    const updatedWait = await this.customRepositories.multiWebhookWait.markCallReceived({
      executionId,
      matchKey,
      payload,
    });

    // null means the call was already received or the matchKey doesn't exist.
    // Re-derive completion from actual call rows (not the counter) to handle
    // duplicates and potential counter desync correctly.
    if (!updatedWait) {
      const calls = await this.customRepositories.multiWebhookWait.getCallsByExecutionId(executionId);
      const pending = calls.filter((c) => !c.received).map((c) => c.matchKey);
      const allReceived = pending.length === 0;

      return {
        accepted: false,
        allReceived,
        totalReceived: calls.filter((c) => c.received).length,
        totalExpected: waitRow.totalExpected,
        pending,
        resumeUrl: allReceived ? waitRow.resumeUrl : null,
        calls: allReceived ? calls : null,
      };
    }

    // Derive completion from actual call rows (authoritative source of truth)
    // rather than relying solely on the counter, which could desync on crash.
    const calls = await this.customRepositories.multiWebhookWait.getCallsByExecutionId(executionId);
    const pending = calls.filter((c) => !c.received).map((c) => c.matchKey);
    const allReceived = pending.length === 0;

    if (allReceived) {
      log.debug('All callbacks received, ready to resume', { executionId });
    }

    return {
      accepted: true,
      allReceived,
      totalReceived: calls.filter((c) => c.received).length,
      totalExpected: updatedWait.totalExpected,
      pending,
      resumeUrl: allReceived ? updatedWait.resumeUrl : null,
      calls: allReceived ? calls : null,
    };
  }

  /**
   * Retrieves the current status of a multi-webhook wait.
   * Returns null if no wait exists for the execution.
   * Derives completion from actual call row state (not the counter).
   */
  async getStatus(executionId: string): Promise<{
    totalExpected: number;
    totalReceived: number;
    allReceived: boolean;
    pending: string[];
    received: string[];
    receivedCalls: Record<string, unknown>;
  } | null> {
    const waitRow = await this.customRepositories.multiWebhookWait.getByExecutionId(executionId);
    if (!waitRow) {
      return null;
    }

    const calls = await this.customRepositories.multiWebhookWait.getCallsByExecutionId(executionId);
    const pending = calls.filter((c) => !c.received).map((c) => c.matchKey);
    const receivedCallRows = calls.filter((c) => c.received);
    const received = receivedCallRows.map((c) => c.matchKey);
    const receivedCalls = Object.fromEntries(receivedCallRows.map((c) => [c.matchKey, c.payload]));

    return {
      totalExpected: waitRow.totalExpected,
      totalReceived: received.length,
      allReceived: pending.length === 0,
      pending,
      received,
      receivedCalls,
    };
  }

  /** Cleans up all state for an execution (called after resume or on timeout). */
  async cleanup(executionId: string): Promise<void> {
    await this.customRepositories.multiWebhookWait.deleteWait(executionId);
    log.debug('Cleaned up multi-webhook wait state', { executionId });
  }
}
