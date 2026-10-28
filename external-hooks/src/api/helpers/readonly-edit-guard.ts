import { READONLY_MODE } from '@config';
import { READONLY_EDIT_MESSAGE, READONLY_MAINTENANCE_CODE } from '../constants/readonly';
import { AppError } from '../utils/errors';

/**
 * Blocks workflow and credential changes in read-only mode.
 * n8n awaits this hook before applying changes.
 */
export function createReadOnlyEditGuard(isReadOnly = READONLY_MODE) {
  return function blockEditsInReadOnlyMode(): void {
    if (!isReadOnly) return;

    throw new AppError(503, READONLY_EDIT_MESSAGE, {
      code: READONLY_MAINTENANCE_CODE,
    });
  };
}
