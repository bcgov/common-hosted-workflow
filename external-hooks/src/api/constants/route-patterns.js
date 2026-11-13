'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.messageCreatePathPattern = exports.workflowInteractionInternalPostPathPattern = void 0;
/**
 * Internal-only POST creates for workflow-interaction layer: messages or action requests.
 * Requires `Authorization: Bearer <INTERNAL_AUTH_TOKEN>`.
 */
exports.workflowInteractionInternalPostPathPattern = /\/rest\/custom\/v1\/(messages|actions)\/?$/;
/** @deprecated Use `workflowInteractionInternalPostPathPattern` (includes `/actions`). */
exports.messageCreatePathPattern = /\/rest\/custom\/v1\/messages\/?$/;
