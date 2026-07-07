/**
 * Action lifecycle state machine.
 *
 * Defines valid status transitions and shared-actor-type checks.
 * Used by ClaimService and ActionService.updateStatus() (External UI path only).
 */

/** Named status constants — avoids magic strings across the claim lifecycle. */
export const ACTION_STATUS_PENDING = 'pending' as const;
export const ACTION_STATUS_CLAIMED = 'claimed' as const;
export const ACTION_STATUS_IN_PROGRESS = 'in_progress' as const;
export const ACTION_STATUS_COMPLETED = 'completed' as const;

/** Actor types that require the claim ceremony before action execution. */
export const ACTOR_TYPE_ROLE = 'role' as const;
export const ACTOR_TYPE_GROUP = 'group' as const;

/**
 * Allowed state transitions for the action lifecycle.
 *
 * - pending → claimed (via ClaimService.claim)
 * - claimed → in_progress (via ClaimService.start)
 * - claimed → pending (via ClaimService.unclaim)
 * - in_progress → completed (via ActionService.updateStatus callback)
 * - completed is a terminal state with no outbound transitions
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  [ACTION_STATUS_PENDING]: [ACTION_STATUS_CLAIMED],
  [ACTION_STATUS_CLAIMED]: [ACTION_STATUS_IN_PROGRESS, ACTION_STATUS_PENDING],
  [ACTION_STATUS_IN_PROGRESS]: [ACTION_STATUS_COMPLETED],
  [ACTION_STATUS_COMPLETED]: [],
};

/** Returns true if transitioning from `from` to `to` is a valid state change. */
export function isValidTransition(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/** Returns true if the actor type requires the claim ceremony (role or group). */
export function isSharedActorType(actorType: string): boolean {
  return actorType === ACTOR_TYPE_ROLE || actorType === ACTOR_TYPE_GROUP;
}
