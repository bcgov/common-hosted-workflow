"use strict";
/**
 * Action lifecycle state machine.
 *
 * Defines valid status transitions and shared-actor-type checks.
 * Used by ClaimService and ActionService.updateStatus() (External UI path only).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTOR_TYPE_GROUP = exports.ACTOR_TYPE_ROLE = exports.ACTION_STATUS_CANCELLED = exports.ACTION_STATUS_COMPLETED = exports.ACTION_STATUS_IN_PROGRESS = exports.ACTION_STATUS_CLAIMED = exports.ACTION_STATUS_PENDING = void 0;
exports.isValidTransition = isValidTransition;
exports.isSharedActorType = isSharedActorType;
/** Named status constants — avoids magic strings across the claim lifecycle. */
exports.ACTION_STATUS_PENDING = 'pending';
exports.ACTION_STATUS_CLAIMED = 'claimed';
exports.ACTION_STATUS_IN_PROGRESS = 'in_progress';
exports.ACTION_STATUS_COMPLETED = 'completed';
exports.ACTION_STATUS_CANCELLED = 'cancelled';
/** Actor types that require the claim ceremony before action execution. */
exports.ACTOR_TYPE_ROLE = 'role';
exports.ACTOR_TYPE_GROUP = 'group';
/**
 * Allowed state transitions for the action lifecycle.
 *
 * - pending → claimed (via ClaimService.claim — role/group only)
 * - pending → in_progress (direct-user actions skip claim)
 * - pending → completed (direct-user actions with instant completion)
 * - claimed → in_progress (via ClaimService.start)
 * - claimed → pending (via ClaimService.unclaim)
 * - in_progress → completed (via ActionService.updateStatus callback)
 * - pending/claimed/in_progress → cancelled (via ActionService.updateStatus when the
 *   callback's upstream execution is gone — e.g. an n8n resume URL for an execution
 *   that has already finished/is not found/no longer waiting)
 * - completed and cancelled are terminal states with no outbound transitions
 */
const ALLOWED_TRANSITIONS = {
    [exports.ACTION_STATUS_PENDING]: [
        exports.ACTION_STATUS_CLAIMED,
        exports.ACTION_STATUS_IN_PROGRESS,
        exports.ACTION_STATUS_COMPLETED,
        exports.ACTION_STATUS_CANCELLED,
    ],
    [exports.ACTION_STATUS_CLAIMED]: [exports.ACTION_STATUS_IN_PROGRESS, exports.ACTION_STATUS_PENDING, exports.ACTION_STATUS_CANCELLED],
    [exports.ACTION_STATUS_IN_PROGRESS]: [exports.ACTION_STATUS_COMPLETED, exports.ACTION_STATUS_CANCELLED],
    [exports.ACTION_STATUS_COMPLETED]: [],
    [exports.ACTION_STATUS_CANCELLED]: [],
};
/** Returns true if transitioning from `from` to `to` is a valid state change. */
function isValidTransition(from, to) {
    return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}
/** Returns true if the actor type requires the claim ceremony (role or group). */
function isSharedActorType(actorType) {
    return actorType === exports.ACTOR_TYPE_ROLE || actorType === exports.ACTOR_TYPE_GROUP;
}
