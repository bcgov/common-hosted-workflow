import { Router, type Response } from 'express';
import type { z } from 'zod';
import type { ApiRouteContext } from '../types/routes';
import type { UiApiTypedRequest } from '../types/ui-api';
import { createRequestParser } from '../utils/validation';
import {
  multiWebhookWaitRegisterSchema,
  multiWebhookWaitCallbackSchema,
  multiWebhookWaitStatusSchema,
} from '../schemas/multi-webhook-wait';
import { OkResponse } from './responses';
import { createLogger } from '../utils/logger';

const log = createLogger('MultiWebhookWaitRoutes');

export function buildMultiWebhookWaitRouter(routeContext: ApiRouteContext) {
  const { services, internalBearerMiddleware } = routeContext;
  const router = Router();

  /**
   * POST /multi-webhook-wait/register
   *
   * Internal-only endpoint called by the MultiWebhookWait custom node before
   * an execution is put to wait. Registers the expected callbacks in the DB.
   *
   * Secured by internalBearerMiddleware (Authorization: Bearer <INTERNAL_AUTH_TOKEN>).
   */
  router.post(
    '/register',
    internalBearerMiddleware,
    createRequestParser(multiWebhookWaitRegisterSchema),
    async (req: UiApiTypedRequest<z.infer<typeof multiWebhookWaitRegisterSchema>>, res: Response) => {
      const { executionId, resumeUrl, expectedCalls } = req.parsed.body;

      await services.multiWebhookWait.register({ executionId, resumeUrl, expectedCalls });

      OkResponse(res, { success: true, message: 'Multi-webhook wait registered', executionId });
    },
  );

  /**
   * POST /multi-webhook-wait/callback/:executionId
   *
   * Internal-only endpoint called by the MultiWebhookWait node's webhook() handler.
   * Marks an individual callback as received and returns the current completion status.
   *
   * The node's webhook handler uses this response to decide whether to resume
   * the workflow (all received) or keep waiting (partial).
   *
   * Request body: { matchKey: string, payload: unknown }
   */
  router.post(
    '/callback/:executionId',
    internalBearerMiddleware,
    createRequestParser(multiWebhookWaitCallbackSchema),
    async (req: UiApiTypedRequest<z.infer<typeof multiWebhookWaitCallbackSchema>>, res: Response) => {
      const { executionId } = req.parsed.params;
      const { matchKey, payload } = req.body as { matchKey: string; payload: unknown };

      log.debug('Marking callback as received', { executionId, matchKey });

      const result = await services.multiWebhookWait.markCallReceived({
        executionId,
        matchKey,
        payload,
      });

      if (result.allReceived) {
        // Cleanup DB state now that all calls are received
        log.debug('All callbacks received, cleaning up', { executionId });
        await services.multiWebhookWait.cleanup(executionId);
      }

      OkResponse(res, {
        allReceived: result.allReceived,
        totalReceived: result.totalReceived,
        totalExpected: result.totalExpected,
        pending: result.pending,
        calls: result.allReceived ? await buildCallsMap(result.calls) : null,
      });
    },
  );

  /**
   * GET /multi-webhook-wait/status/:executionId
   *
   * Internal-only endpoint to check the current progress of a multi-webhook wait.
   * Used by the node on timeout to retrieve partial results.
   */
  router.get(
    '/status/:executionId',
    internalBearerMiddleware,
    createRequestParser(multiWebhookWaitStatusSchema),
    async (req: UiApiTypedRequest<z.infer<typeof multiWebhookWaitStatusSchema>>, res: Response) => {
      const { executionId } = req.parsed.params;

      const status = await services.multiWebhookWait.getStatus(executionId);
      if (!status) {
        res.status(404).json({ error: { message: 'No pending multi-webhook wait found' } });
        return;
      }

      OkResponse(res, status);
    },
  );

  /**
   * DELETE /multi-webhook-wait/cleanup/:executionId
   *
   * Internal-only endpoint to clean up DB state after timeout resume.
   */
  router.delete('/cleanup/:executionId', internalBearerMiddleware, async (req, res: Response) => {
    const executionId = req.params.executionId;

    await services.multiWebhookWait.cleanup(executionId);

    OkResponse(res, { success: true, message: 'Cleaned up' });
  });

  return router;
}

/**
 * Builds a map of matchKey → payload from the completed call records.
 */
async function buildCallsMap(
  calls: Array<{ matchKey: string; payload: unknown }> | null,
): Promise<Record<string, unknown>> {
  if (!calls) return {};
  const result: Record<string, unknown> = {};
  for (const call of calls) {
    result[call.matchKey] = call.payload;
  }
  return result;
}
