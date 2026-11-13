'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const readonly_1 = require('../../../src/api/constants/readonly');
const readonly_edit_guard_1 = require('../../../src/api/helpers/readonly-edit-guard');
const errors_1 = require('../../../src/api/utils/errors');
(0, vitest_1.describe)('read-only edit guard', () => {
  (0, vitest_1.it)('lets the change through on Gold', () => {
    (0, vitest_1.expect)((0, readonly_edit_guard_1.createReadOnlyEditGuard)(false)()).toBeUndefined();
  });
  (0, vitest_1.it)('refuses the change in read-only mode with a 503 maintenance error', () => {
    const guard = (0, readonly_edit_guard_1.createReadOnlyEditGuard)(true);
    (0, vitest_1.expect)(guard).toThrow(errors_1.AppError);
    (0, vitest_1.expect)(guard).toThrow(
      vitest_1.expect.objectContaining({
        statusCode: 503,
        message: readonly_1.READONLY_EDIT_MESSAGE,
        details: { code: 'READONLY_MODE' },
      }),
    );
  });
});
