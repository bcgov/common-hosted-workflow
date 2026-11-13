'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const http_helper_1 = require('../../../src/api/helpers/http-helper');
(0, vitest_1.describe)('formatPatchActionStatusMessage', () => {
  (0, vitest_1.it)('returns deletion message for "deleted" status', () => {
    (0, vitest_1.expect)((0, http_helper_1.formatPatchActionStatusMessage)('deleted')).toBe(
      'The action has been deleted.',
    );
  });
  (0, vitest_1.it)('returns generic update message for other statuses', () => {
    (0, vitest_1.expect)((0, http_helper_1.formatPatchActionStatusMessage)('completed')).toBe(
      'Status updated to completed.',
    );
    (0, vitest_1.expect)((0, http_helper_1.formatPatchActionStatusMessage)('pending')).toBe(
      'Status updated to pending.',
    );
    (0, vitest_1.expect)((0, http_helper_1.formatPatchActionStatusMessage)('in_progress')).toBe(
      'Status updated to in_progress.',
    );
  });
});
