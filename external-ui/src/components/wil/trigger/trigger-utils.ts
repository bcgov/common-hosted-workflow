import type { Trigger } from '../../../services/backend/triggers';

/**
 * Returns true if the logged-in user matches a trigger's allowed_actors configuration.
 * Managers (project:editor / global:admin / global:owner) bypass this check entirely.
 *
 * Supports:
 *  - '*'             → visible to everyone
 *  - role type       → matches the user's n8n role slug
 *  - user type       → matches the user's email
 *  - comma-separated → any single match is sufficient
 */
export function canUserSeeTrigger(trigger: Trigger, userRoleSlug: string, userEmail: string): boolean {
  const { allowedActors, allowedActorsType } = trigger.config;

  if (allowedActors.trim() === '*') return true;

  const actors = allowedActors.split(',').map((a) => a.trim().toLowerCase());

  if (allowedActorsType === 'role') return actors.includes(userRoleSlug.toLowerCase());
  if (allowedActorsType === 'user') return actors.includes(userEmail.toLowerCase());

  // 'group' and 'other' — no client-side resolution yet
  return false;
}
