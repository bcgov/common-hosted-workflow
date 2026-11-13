'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TRIGGER_FAILED_MESSAGE =
  exports.TRIGGER_MANAGE_ROLE =
  exports.ACTION_NO_LONGER_VALID_MESSAGE =
  exports.CALLBACK_CANCEL_STATUS_CODES =
  exports.CALLBACK_TIMEOUT_MS =
    void 0;
/** Timeout (ms) for outbound webhook / callback HTTP requests. */
exports.CALLBACK_TIMEOUT_MS = 30_000;
/**
 * Upstream HTTP status codes that mean the callback target is permanently gone,
 * so the action can no longer be completed and should be auto-cancelled.
 *
 * These map to n8n execution-resume responses when the execution has already
 * finished (409), was not found (404), or is no longer waiting/gone (410).
 * Detection is by status code only — the upstream response body is never parsed.
 */
exports.CALLBACK_CANCEL_STATUS_CODES = new Set([404, 409, 410]);
/** User-facing message shown when an action is auto-cancelled because its callback target is gone. */
exports.ACTION_NO_LONGER_VALID_MESSAGE =
  'This action is no longer valid because the workflow that requested it has already finished or is no longer waiting for a response. It has been moved to Cancelled.';
/** Role required to create, edit, or delete triggers on a non-personal project. */
exports.TRIGGER_MANAGE_ROLE = 'project:editor';
/** Generic user-facing message returned when a trigger's upstream webhook fails. */
exports.TRIGGER_FAILED_MESSAGE = 'Unable to trigger the workflow. Please try again or contact your administrator.';
