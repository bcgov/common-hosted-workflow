import type { Trigger, TriggerActorType } from '../../../services/backend/triggers';

/**
 * Returns true if the logged-in user matches a trigger's allowed_actors configuration.
 * Managers bypass this check entirely (checked before calling this function).
 *
 * Supports:
 *  - '*'             → visible to everyone
 *  - role type       → any of the user's tenant roles must appear in the list
 *  - user type       → matches the user's email
 *  - comma-separated → any single match is sufficient
 */
export function canUserSeeTrigger(trigger: Trigger, userRoles: readonly string[], userEmail: string): boolean {
  const { allowedActors, allowedActorsType } = trigger.config;

  if (allowedActors.trim() === '*') return true;

  const actors = new Set(allowedActors.split(',').map((a) => a.trim().toLowerCase()));

  if (allowedActorsType === 'role') return userRoles.some((r) => actors.has(r.toLowerCase()));
  if (allowedActorsType === 'user') return actors.has(userEmail.toLowerCase());

  // 'group' and 'other' — no client-side resolution yet
  return false;
}

/**
 * For personal project tenants, pre-fills allowedActorsType = 'user' and
 * allowedActors = the logged-in user's email, and returns the updated form.
 * No-ops when isPersonal is false.
 */
export function applyPersonalActorDefaults<T extends { allowedActors: string; allowedActorsType: TriggerActorType }>(
  form: T,
  isPersonal: boolean,
  userEmail: string,
): T {
  if (!isPersonal) return form;
  return { ...form, allowedActorsType: 'user', allowedActors: userEmail };
}
