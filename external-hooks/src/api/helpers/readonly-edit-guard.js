'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createReadOnlyEditGuard = createReadOnlyEditGuard;
const _config_1 = require('@config');
const readonly_1 = require('../constants/readonly');
const errors_1 = require('../utils/errors');
/**
 * Blocks workflow and credential changes in read-only mode.
 * n8n awaits this hook before applying changes.
 */
function createReadOnlyEditGuard(isReadOnly = _config_1.READONLY_MODE) {
  return function blockEditsInReadOnlyMode() {
    if (!isReadOnly) return;
    throw new errors_1.AppError(503, readonly_1.READONLY_EDIT_MESSAGE, {
      code: readonly_1.READONLY_MAINTENANCE_CODE,
    });
  };
}
