import { Router, type Request, type Response } from 'express';
import type { ApiRouteContext } from '../types/routes';
import type { UiApiTypedRequest } from '../types/ui-api';
import { createRequestParser } from '../utils/validation';
import { chefsSubmissionCallbackSchema } from '../schemas/chefs-submission';
import { OkResponse } from './responses';
import { AppError } from '../utils/errors';
import { callWebhook } from './helpers/webhook-fire';
import { CALLBACK_TIMEOUT_MS } from './constants/constants';
import { createLogger } from '../utils/logger';
import type { z } from 'zod';

const log = createLogger('ChefsSubmissionRoutes');

const WEBHOOK_URL_HEADER = 'x-n8n-webhook-url';

/** Constructs the outbound URL by appending the incoming request's query params to the base webhook URL. */
function buildOutboundUrl(baseUrl: string, req: Request): string {
  if (!req.url || !req.url.includes('?')) return baseUrl;
  const incomingQuery = req.url.slice(req.url.indexOf('?') + 1);
  const separator = baseUrl.includes('?') ? (baseUrl.endsWith('?') ? '' : '&') : '?';
  return `${baseUrl}${separator}${incomingQuery}`;
}

export function buildChefsSubmissionRouter(routeContext: ApiRouteContext) {
  const { customRepositories } = routeContext;
  const router = Router();

  /**
   * POST /chefs/submissions/callback
   * Receives submission events from CHEFS (Form Builder Service).
   *
   * - Resolves formId/submissionId from the request body.
   * - Looks up a pending `chefs_submission_webhook` row by formId + submissionId.
   * - If found, forwards to the stored webhook_url and marks the row completed on 2xx.
   * - If not found, falls back to the `x-n8n-webhook-url` request header.
   * - The incoming request body and query params are forwarded as-is.
   */
  router.post(
    '/submissions/callback',
    createRequestParser(chefsSubmissionCallbackSchema),
    async (req: UiApiTypedRequest<z.infer<typeof chefsSubmissionCallbackSchema>>, res: Response) => {
      const { formId, submissionId } = req.parsed.body;
      const headerWebhookUrl = req.header(WEBHOOK_URL_HEADER);

      const pendingRow = await customRepositories.chefsSubmissionWebhook.getPendingByFormAndSubmission({
        formId,
        submissionId,
      });

      const outboundUrl = pendingRow?.webhookUrl ?? headerWebhookUrl;
      if (!outboundUrl) {
        throw new AppError(400, `Missing webhook URL: no pending record and no ${WEBHOOK_URL_HEADER} header`);
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
        await customRepositories.chefsSubmissionWebhook.markCompleted({ formId, submissionId });
      }

      OkResponse(res, { success: true, message: 'CHEFS submission callback forwarded' });
    },
  );

  return router;
}
