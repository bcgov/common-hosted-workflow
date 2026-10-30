import type { CustomRepositories } from '../bootstrap/custom-repositories';
import { AppError } from '../utils/errors';
import { createLogger } from '../utils/logger';
import { N8N_BASE_URL } from '@config';

const log = createLogger('ChefsSubmissionService');

/** The only CHEFS subscription event (`subscriptionEvent`) that triggers a workflow forward. */
export const CHEFS_EVENT_SUBMISSION = 'eventSubmission';

export interface ResolveForwardInput {
  webhookPath: string;
  subscriptionEvent: string;
  formId: string;
  submissionId: string;
}

/** Outcome of resolving where (and whether) a CHEFS submission callback should be forwarded. */
export type ResolveForwardResult =
  | { action: 'ignore' }
  | { action: 'forward'; outboundBaseUrl: string; usedDbRow: boolean };

/**
 * Business logic for the CHEFS submission callback: decides whether an event should be forwarded,
 * resolves the outbound base URL (resume URL for a resubmission vs. the path-derived webhook URL for
 * a fresh submission), and deletes the pending row after a successful delivery.
 *
 * HTTP mechanics (header forwarding, firing the request, writing the response) stay in the route.
 */
export class ChefsSubmissionService {
  constructor(private readonly customRepositories: CustomRepositories) {}

  /**
   * Resolves the forward decision for an incoming CHEFS callback.
   *
   * - Non-submission events (`subscriptionEvent !== 'eventSubmission'`) → `{ action: 'ignore' }`.
   * - A pending `chefs_submission_webhook` row (resubmission) → forward to the stored resume URL.
   * - Otherwise (fresh submission) → forward to `${N8N_BASE_URL}/webhook/<webhookPath>`.
   */
  async resolveForward(input: ResolveForwardInput): Promise<ResolveForwardResult> {
    const { webhookPath, subscriptionEvent, formId, submissionId } = input;

    if (subscriptionEvent !== CHEFS_EVENT_SUBMISSION) {
      log.debug('Ignoring non-submission CHEFS event', { subscriptionEvent, formId, submissionId });
      return { action: 'ignore' };
    }

    const pendingRow = await this.customRepositories.chefsSubmissionWebhook.getPendingByFormAndSubmission({
      formId,
      submissionId,
    });

    if (pendingRow) {
      return { action: 'forward', outboundBaseUrl: pendingRow.webhookUrl, usedDbRow: true };
    }

    return { action: 'forward', outboundBaseUrl: this.buildWebhookUrlFromPath(webhookPath), usedDbRow: false };
  }

  /** Deletes the pending resubmission row once the resume URL has accepted the callback (2xx). */
  async confirmDelivered(params: { formId: string; submissionId: string; usedDbRow: boolean }): Promise<void> {
    if (!params.usedDbRow) return;
    await this.customRepositories.chefsSubmissionWebhook.deleteRow({
      formId: params.formId,
      submissionId: params.submissionId,
    });
  }

  /** Registers a pending resubmission row (CHEFS Resubmit Wait node, before putting the run to wait). */
  async register(params: {
    executionId: string;
    formId: string;
    submissionId: string;
    resumeUrl: string;
  }): Promise<void> {
    log.debug('Registering CHEFS submission webhook', {
      formId: params.formId,
      submissionId: params.submissionId,
      executionId: params.executionId,
    });
    await this.customRepositories.chefsSubmissionWebhook.upsertPending({
      executionId: params.executionId,
      formId: params.formId,
      submissionId: params.submissionId,
      webhookUrl: params.resumeUrl,
    });
  }

  /** Builds a full webhook URL by resolving a webhook path against the configured n8n base URL. */
  private buildWebhookUrlFromPath(path: string): string {
    if (!N8N_BASE_URL) {
      throw new AppError(500, 'Cannot build webhook URL from path: N8N_BASE_URL is not configured');
    }
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const base = N8N_BASE_URL.endsWith('/') ? N8N_BASE_URL : `${N8N_BASE_URL}/`;
    return new URL(`webhook/${normalizedPath}`, base).toString();
  }
}
