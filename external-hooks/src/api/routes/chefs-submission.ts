import { Router, type Request, type Response } from 'express';
import type { ApiRouteContext } from '../types/routes';
import type { UiApiTypedRequest } from '../types/ui-api';
import { createRequestParser } from '../utils/validation';
import { chefsSubmissionCallbackSchema, chefsSubmissionRegisterSchema } from '../schemas/chefs-submission';
import { OkResponse } from './responses';
import { callWebhook } from './helpers/webhook-fire';
import { CALLBACK_TIMEOUT_MS } from './constants/constants';
import { createLogger } from '../utils/logger';
import type { z } from 'zod';

const log = createLogger('ChefsSubmissionRoutes');

/**
 * Incoming headers that must NOT be forwarded to the n8n webhook: hop-by-hop headers and
 * request-framing headers that would conflict with the outbound request we build. `content-type`
 * is excluded too — `callWebhook` sets a single canonical `Content-Type: application/json` for the
 * re-serialized body (forwarding the incoming one caused a duplicated header that broke JSON
 * parsing on the n8n side). Everything else (including the caller-chosen auth header, e.g.
 * `x-n8n-chef-key`) is passed through so the n8n Webhook node's Header Auth can validate it.
 */
const NON_FORWARDED_HEADERS = new Set([
  'host',
  'content-length',
  'content-type',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
  'accept-encoding',
]);

/** Appends the incoming request's query params to the resolved base webhook URL. */
function buildOutboundUrl(baseUrl: string, req: Request): string {
  if (!req.url || !req.url.includes('?')) return baseUrl;
  const incomingQuery = req.url.slice(req.url.indexOf('?') + 1);
  const separator = baseUrl.includes('?') ? (baseUrl.endsWith('?') ? '' : '&') : '?';
  return `${baseUrl}${separator}${incomingQuery}`;
}

/**
 * Collects the incoming request headers to forward to the n8n webhook, preserving the caller-chosen
 * authentication header (the n8n Webhook node validates it via its Header Auth credential). Drops
 * hop-by-hop / framing / content-type headers (see `NON_FORWARDED_HEADERS`).
 */
function buildForwardedHeaders(req: Request): Record<string, string> {
  const forwarded: Record<string, string> = {};
  const raw = req.headers as Record<string, unknown>;
  for (const [name, value] of Object.entries(raw)) {
    if (NON_FORWARDED_HEADERS.has(name.toLowerCase())) continue;
    if (Array.isArray(value)) forwarded[name] = value.join(', ');
    else if (typeof value === 'string') forwarded[name] = value;
  }
  return forwarded;
}

export function buildChefsSubmissionRouter(routeContext: ApiRouteContext) {
  const { services, internalBearerMiddleware } = routeContext;
  const router = Router();

  /**
   * POST /chefs/submissions/register
   * Internal-only endpoint called by the CHEFS Resubmit Wait custom node before an execution is put
   * to wait. Registered before the `/:webhookPath` catch-all so it is never shadowed.
   *
   * - Secured by internalBearerMiddleware (Authorization: Bearer <INTERNAL_AUTH_TOKEN>).
   * - Registers a pending `chefs_submission_webhook` row so the later CHEFS callback can resume the
   *   correct n8n execution.
   */
  router.post(
    '/submissions/register',
    internalBearerMiddleware,
    createRequestParser(chefsSubmissionRegisterSchema),
    async (req: UiApiTypedRequest<z.infer<typeof chefsSubmissionRegisterSchema>>, res: Response) => {
      const { executionId, formId, submissionId, resumeUrl } = req.parsed.body;
      await services.chefsSubmission.register({ executionId, formId, submissionId, resumeUrl });
      OkResponse(res, { success: true, message: 'CHEFS submission webhook registered' });
    },
  );

  /**
   * POST /chefs/:webhookPath
   * CHEFS-facing entry point for submission events. external-hooks forwards to the n8n Webhook node;
   * the webhook authenticates the caller itself via its Header Auth credential. CHEFS sends the
   * agreed auth header (e.g. `x-n8n-chef-key: <value>`); external-hooks passes it through unchanged.
   *
   * The forward decision (ignore non-submission events; resume URL for resubmissions vs. the
   * path-derived webhook URL for fresh submissions) and the post-delivery row cleanup live in
   * `ChefsSubmissionService`. This handler only shapes and fires the HTTP request and writes the
   * response. external-hooks does not validate the auth header — the n8n Webhook node does.
   */
  router.post(
    '/:webhookPath',
    createRequestParser(chefsSubmissionCallbackSchema),
    async (req: UiApiTypedRequest<z.infer<typeof chefsSubmissionCallbackSchema>>, res: Response) => {
      const { webhookPath } = req.parsed.params;
      const { subscriptionEvent, formId, submissionId } = req.parsed.body;

      const decision = await services.chefsSubmission.resolveForward({
        webhookPath,
        subscriptionEvent,
        formId,
        submissionId,
      });

      if (decision.action === 'ignore') {
        OkResponse(res, { success: true, message: 'Event ignored (not a submission event)' });
        return;
      }

      const requestUrl = buildOutboundUrl(decision.outboundBaseUrl, req);
      const payload = JSON.stringify(req.body ?? {});

      log.info('Forwarding CHEFS submission callback', {
        requestUrl,
        formId,
        submissionId,
        source: decision.usedDbRow ? 'db' : 'path',
      });

      const upstream = await callWebhook({
        url: requestUrl,
        method: 'POST',
        body: payload,
        timeoutMs: CALLBACK_TIMEOUT_MS,
        timeoutMessage: 'CHEFS submission callback timed out',
        unreachableMessage: 'CHEFS submission webhook URL unreachable',
        headers: buildForwardedHeaders(req),
      });

      if (!upstream.ok) {
        const upstreamBody = await upstream.text();
        res.status(upstream.status).json({
          error: { message: upstreamBody || `Upstream returned ${upstream.status}` },
        });
        return;
      }

      await services.chefsSubmission.confirmDelivered({ formId, submissionId, usedDbRow: decision.usedDbRow });

      OkResponse(res, { success: true, message: 'CHEFS submission callback forwarded' });
    },
  );

  return router;
}
