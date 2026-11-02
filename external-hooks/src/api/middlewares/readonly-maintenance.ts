import type { NextFunction, Request, Response } from 'express';
import { READONLY_MODE } from '@config';
import { READONLY_MAINTENANCE_CODE, READONLY_WRITE_MESSAGE } from '../constants/readonly';
import { AppError } from '../utils/errors';

// Advisory only: tells clients when it is reasonable to retry.
const RETRY_AFTER_SECONDS = '300';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// POST routes that only read.
const READ_ONLY_POST_SUFFIX = '/chefs-token';

// Endpoints the MultiWebhookWait and CHEFS Resubmit Wait nodes / CHEFS callbacks call while a
// workflow runs. Workflows without WIL nodes stay available in read-only mode, so these must keep
// working. Matches: /multi-webhook-wait/..., /chefs/submissions/register, and the CHEFS callback
// /chefs/<webhookPath> (a single segment that is not "submissions").
const WORKFLOW_RUNTIME_PATH = /^\/(multi-webhook-wait\/|chefs\/submissions\/register$|chefs\/(?!submissions$)[^/]+$)/;

/**
 * In read-only mode, refuses writes to the WIL and custom-integration routes with a 503.
 */
export function createReadOnlyMiddleware(isReadOnly = READONLY_MODE) {
  return (req: Request, res: Response, next: NextFunction) => {
    const isAllowed =
      READ_METHODS.has(req.method) ||
      (req.method === 'POST' && req.path.endsWith(READ_ONLY_POST_SUFFIX)) ||
      WORKFLOW_RUNTIME_PATH.test(req.path);

    if (!isReadOnly || isAllowed) {
      return next();
    }

    res.setHeader('Retry-After', RETRY_AFTER_SECONDS);
    return next(new AppError(503, READONLY_WRITE_MESSAGE, { code: READONLY_MAINTENANCE_CODE }));
  };
}
