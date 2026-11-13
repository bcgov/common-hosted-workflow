'use strict';
/**
 * Small HTTP response helpers for workflow-interaction routes.
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.formatPatchActionStatusMessage = formatPatchActionStatusMessage;
/**
 * Builds the `message` field for a successful PATCH on an action request (`status` + human-readable copy).
 */
function formatPatchActionStatusMessage(newStatus) {
  return newStatus === 'deleted' ? 'The action has been deleted.' : `Status updated to ${newStatus}.`;
}
