import type { WilActionItem, WilCallbackResponse } from '../../services/backend/wil';

/**
 * Builds a locally-cancelled snapshot of an action so the detail pane can flip to
 * the terminal (cancelled) view immediately, carrying the reason from the callback
 * response. The subsequent list refetch reconciles this with the server value.
 */
export function buildCancelledActionSnapshot(action: WilActionItem, result: WilCallbackResponse): WilActionItem {
  return {
    ...action,
    status: 'cancelled',
    cancellationReason: result.message ?? null,
    completedAt: action.completedAt ?? new Date().toISOString(),
  };
}

/**
 * Builds a locally-completed snapshot of an action so the detail pane can flip to
 * the terminal (completed) view immediately after the user submits their response.
 * This removes any claim/unclaim controls, since the action has been acted upon.
 * The subsequent list refetch reconciles this with the server value.
 */
export function buildCompletedActionSnapshot(action: WilActionItem): WilActionItem {
  return {
    ...action,
    status: 'completed',
    completedAt: action.completedAt ?? new Date().toISOString(),
  };
}
