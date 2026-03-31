/**
 * Internal-only POST creates for workflow-interaction layer: messages or action requests.
 * Requires `Authorization: Bearer <INTERNAL_AUTH_TOKEN>`.
 */
export const workflowInteractionInternalPostPathPattern = /\/rest\/custom\/v1\/(messages|actions)\/?$/;

/** @deprecated Use `workflowInteractionInternalPostPathPattern` (includes `/actions`). */
export const messageCreatePathPattern = /\/rest\/custom\/v1\/messages\/?$/;
