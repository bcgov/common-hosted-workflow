import { IS_GOLDDR } from '@config';
import { GOLDDR_EDIT_MESSAGE, GOLDDR_MAINTENANCE_CODE } from '../constants/golddr';
import { AppError } from '../utils/errors';

/**
 * Blocks workflow and credential changes on GoldDR.
 * n8n awaits this hook before applying changes.
 */
export function createGoldDrEditGuard(isGoldDr = IS_GOLDDR) {
  return async function blockEditsOnGoldDr(): Promise<void> {
    if (!isGoldDr) return;

    throw new AppError(503, GOLDDR_EDIT_MESSAGE, {
      code: GOLDDR_MAINTENANCE_CODE,
    });
  };
}
