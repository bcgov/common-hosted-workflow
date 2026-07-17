import { Router, type Request, type Response } from 'express';
import type { ApiRouteContext } from '../types/routes';
import type { UiApiTypedRequest } from '../types/ui-api';
import { createRequestParser } from '../utils/validation';
import { chefsSubmissionCallbackSchema, chefsSubmissionRegisterSchema } from '../schemas/chefs-submission';
import { OkResponse } from './responses';
import { AppError } from '../utils/errors';
import { callWebhook } from './helpers/webhook-fire';
import { CALLBACK_TIMEOUT_MS } from './constants/constants';
import { createLogger } from '../utils/logger';
import { N8N_BASE_URL } from '@config';
import type { z } from 'zod';

const log = createLogger('ChefsSubmissionRoutes');

const WEBHOOK_PATH_HEADER = 'x-n8n-webhook-path';

/** Builds a full webhook URL by resolving a webhook path against the configured n8n base URL. */
function buildWebhookUrlFromPath(path: string): string {
  if (!N8N_BASE_URL) {
    throw new AppError(500, `Cannot build webhook URL from path: N8N_BASE_URL is not configured`);
  }
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const base = N8N_BASE_URL.endsWith('/') ? N8N_BASE_URL : `${N8N_BASE_URL}/`;
  return new URL(normalizedPath, base).toString();
}

/** Constructs the outbound URL by appending the incoming request's query params to the base webhook URL. */
function buildOutboundUrl(baseUrl: string, req: Request): string {
  if (!req.url || !req.url.includes('?')) return baseUrl;
  const incomingQuery = req.url.slice(req.url.indexOf('?') + 1);
  const separator = baseUrl.includes('?') ? (baseUrl.endsWith('?') ? '' : '&') : '?';
  return `${baseUrl}${separator}${incomingQuery}`;
}

export function buildChefsSubmissionRouter(routeContext: ApiRouteContext) {
  const { customRepositories, internalBearerMiddleware } = routeContext;
  const router = Router();

  /**
   * POST /chefs/submissions/callback
   * Receives submission events from CHEFS (Form Builder Service).
   *
   * - Resolves formId/submissionId from the request body.
   * - Looks up a pending `chefs_submission_webhook` row by formId + submissionId.
   * - If found, forwards to the stored webhook_url and deletes the row on 2xx.
   * - If not found, falls back to the `x-n8n-webhook-path` request header, resolving it
   *   against the configured `N8N_BASE_URL` to produce the full outbound webhook URL.
   * - The incoming request body and query params are forwarded as-is.
   */
  router.post(
    '/submissions/callback',
    createRequestParser(chefsSubmissionCallbackSchema),
    async (req: UiApiTypedRequest<z.infer<typeof chefsSubmissionCallbackSchema>>, res: Response) => {
      const { formId, submissionId } = req.parsed.body;
      const headerWebhookPath = req.header(WEBHOOK_PATH_HEADER);

      const pendingRow = await customRepositories.chefsSubmissionWebhook.getPendingByFormAndSubmission({
        formId,
        submissionId,
      });

      let outboundUrl: string | undefined = pendingRow?.webhookUrl;
      if (!outboundUrl && headerWebhookPath) {
        outboundUrl = buildWebhookUrlFromPath(headerWebhookPath);
      }
      if (!outboundUrl) {
        throw new AppError(400, `Missing webhook URL: no pending record and no ${WEBHOOK_PATH_HEADER} header`);
      }

      const usedDbRow = pendingRow !== null;
      const requestUrl = buildOutboundUrl(outboundUrl, req);
      const payload = JSON.stringify(req.body ?? {});

      log.debug('Forwarding CHEFS submission callback', {
        formId,
        submissionId,
        source: usedDbRow ? 'db' : 'header',
      });

      const upstream = await callWebhook({
        url: requestUrl,
        method: 'POST',
        body: payload,
        timeoutMs: CALLBACK_TIMEOUT_MS,
        timeoutMessage: 'CHEFS submission callback timed out',
        unreachableMessage: 'CHEFS submission webhook URL unreachable',
      });

      if (!upstream.ok) {
        const upstreamBody = await upstream.text();
        res.status(upstream.status).json({
          error: { message: upstreamBody || `Upstream returned ${upstream.status}` },
        });
        return;
      }

      if (usedDbRow) {
        await customRepositories.chefsSubmissionWebhook.deleteRow({ formId, submissionId });
      }

      OkResponse(res, { success: true, message: 'CHEFS submission callback forwarded' });
    },
  );

  /**
   * POST /chefs/submissions/register
   * Internal-only endpoint called by the CHEFS Resubmit custom node before an
   * execution is put to wait.
   *
   * - Secured by internalBearerMiddleware (Authorization: Bearer <INTERNAL_AUTH_TOKEN>).
   * - Upserts a `chefs_submission_webhook` row keyed by (formId, submissionId),
   *   storing executionId and resumeUrl so the later CHEFS callback route knows
   *   which n8n execution to resume.
   */
  router.post(
    '/submissions/register',
    internalBearerMiddleware,
    createRequestParser(chefsSubmissionRegisterSchema),
    async (req: UiApiTypedRequest<z.infer<typeof chefsSubmissionRegisterSchema>>, res: Response) => {
      const { executionId, formId, submissionId, resumeUrl } = req.parsed.body;

      log.debug('Registering CHEFS submission webhook', { formId, submissionId, executionId });

      await customRepositories.chefsSubmissionWebhook.upsertPending({
        executionId,
        formId,
        submissionId,
        webhookUrl: resumeUrl,
      });

      OkResponse(res, { success: true, message: 'CHEFS submission webhook registered' });
    },
  );

  return router;
}
