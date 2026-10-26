import { Router, type Express, type Request, type Response } from 'express';
import { IS_GOLDDR } from '@config';
import { GOLDDR_EDIT_MESSAGE, GOLDDR_MAINTENANCE_CODE } from '../constants/golddr';

function refuse(_req: Request, res: Response) {
  res.status(503).json({ code: 503, message: GOLDDR_EDIT_MESSAGE, details: { code: GOLDDR_MAINTENANCE_CODE } });
}

// Management operations that no before-hook covers.
// Keep the paths and HTTP methods aligned with n8n's route definitions.
// Workflow archive/unarchive and workflow/credential transfer are blocked on both APIs; sharing and folder
// transfer are blocked on the editor API (/rest) only, because the public API (/api/v1) has no such routes.
function buildEditRouteBlock() {
  const router = Router();

  router.post(
    [
      '/rest/workflows/:id/archive',
      '/rest/workflows/:id/unarchive',
      '/api/v1/workflows/:id/archive',
      '/api/v1/workflows/:id/unarchive',
    ],
    refuse,
  );

  router.put(
    [
      '/rest/workflows/:id/transfer',
      '/rest/credentials/:id/transfer',
      '/rest/folders/:id/transfer',
      '/api/v1/workflows/:id/transfer',
      '/api/v1/credentials/:id/transfer',
      '/rest/workflows/:id/share',
      '/rest/credentials/:id/share',
    ],
    refuse,
  );

  return router;
}

/**
 * On GoldDR, refuses workflow and credential management operations and folder transfers.
 * The Express app only becomes available after n8n has registered its routes, so the block is moved to the front
 * of Express 5's router stack; added at the end it would never be reached.
 * This relies on the internal `app.router.stack`, so it fails at startup if the stack is unavailable or the block
 * cannot be identified after registration.
 */
export function blockN8nEditRoutes(app: Express, isGoldDr = IS_GOLDDR) {
  if (!isGoldDr) return;

  const router = app.router as unknown as { stack?: unknown[] } | undefined;
  const stack = router?.stack;
  if (!Array.isArray(stack)) {
    throw new TypeError('Cannot put the GoldDR route block first: the Express route list was not found');
  }

  const block = buildEditRouteBlock();
  app.use(block);

  // Move only the block; leave n8n's route order unchanged.
  const last = stack.at(-1) as { handle?: unknown } | undefined;
  if (last?.handle !== block) {
    throw new TypeError('Cannot put the GoldDR route block first: the last Express layer is not the block');
  }

  stack.unshift(stack.pop());
}
