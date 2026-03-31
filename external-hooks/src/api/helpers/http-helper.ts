/**
 * Small HTTP response helpers for workflow-interaction routes.
 */

/**
 * Builds the `message` field for a successful PATCH on an action request (`status` + human-readable copy).
 */
export function formatPatchActionStatusMessage(newStatus: string): string {
  return newStatus === 'deleted' ? 'The action has been deleted.' : `Status updated to ${newStatus}.`;
}
