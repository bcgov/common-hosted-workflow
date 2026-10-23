import type { NextFunction, Request, Response } from 'express';
import { IS_GOLDDR } from '@config';
import { GOLDDR_MAINTENANCE_CODE, GOLDDR_WRITE_MESSAGE } from '../constants/golddr';
import { AppError } from '../utils/errors';

// Advisory only: tells clients when it is reasonable to retry.
const RETRY_AFTER_SECONDS = '300';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// POST routes that only read.
const READ_ONLY_POST_PATH = /\/chefs-token$/;

/**
 * On GoldDR, refuses writes to the WIL and custom-integration routes with a 503.
 * Does nothing on Gold.
 */
export function createGoldDrMaintenanceMiddleware(isGoldDr = IS_GOLDDR) {
  return (req: Request, res: Response, next: NextFunction) => {
    const isReadOnly = READ_METHODS.has(req.method) || (req.method === 'POST' && READ_ONLY_POST_PATH.test(req.path));

    if (!isGoldDr || isReadOnly) {
      return next();
    }

    res.setHeader('Retry-After', RETRY_AFTER_SECONDS);
    return next(new AppError(503, GOLDDR_WRITE_MESSAGE, { code: GOLDDR_MAINTENANCE_CODE }));
  };
}
