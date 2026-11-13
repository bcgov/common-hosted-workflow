'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ChefsSubmissionService = exports.CHEFS_EVENT_SUBMISSION = void 0;
const errors_1 = require('../utils/errors');
const logger_1 = require('../utils/logger');
const _config_1 = require('@config');
const log = (0, logger_1.createLogger)('ChefsSubmissionService');
/** The only CHEFS subscription event (`subscriptionEvent`) that triggers a workflow forward. */
exports.CHEFS_EVENT_SUBMISSION = 'eventSubmission';
/**
 * Business logic for the CHEFS submission callback: decides whether an event should be forwarded,
 * resolves the outbound base URL (resume URL for a resubmission vs. the path-derived webhook URL for
 * a fresh submission), and deletes the pending row after a successful delivery.
 *
 * HTTP mechanics (header forwarding, firing the request, writing the response) stay in the route.
 */
class ChefsSubmissionService {
  customRepositories;
  constructor(customRepositories) {
    this.customRepositories = customRepositories;
  }
  /**
   * Resolves the forward decision for an incoming CHEFS callback.
   *
   * - Non-submission events (`subscriptionEvent !== 'eventSubmission'`) → `{ action: 'ignore' }`.
   * - A pending `chefs_submission_webhook` row (resubmission) → forward to the stored resume URL.
   * - Otherwise (fresh submission) → forward to `${N8N_BASE_URL}/webhook/<webhookPath>`.
   */
  async resolveForward(input) {
    const { webhookPath, subscriptionEvent, formId, submissionId } = input;
    if (subscriptionEvent !== exports.CHEFS_EVENT_SUBMISSION) {
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
  async confirmDelivered(params) {
    if (!params.usedDbRow) return;
    await this.customRepositories.chefsSubmissionWebhook.deleteRow({
      formId: params.formId,
      submissionId: params.submissionId,
    });
  }
  /** Registers a pending resubmission row (CHEFS Resubmit Wait node, before putting the run to wait). */
  async register(params) {
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
  buildWebhookUrlFromPath(path) {
    if (!_config_1.N8N_BASE_URL) {
      throw new errors_1.AppError(500, 'Cannot build webhook URL from path: N8N_BASE_URL is not configured');
    }
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const base = _config_1.N8N_BASE_URL.endsWith('/') ? _config_1.N8N_BASE_URL : `${_config_1.N8N_BASE_URL}/`;
    return new URL(`webhook/${normalizedPath}`, base).toString();
  }
}
exports.ChefsSubmissionService = ChefsSubmissionService;
