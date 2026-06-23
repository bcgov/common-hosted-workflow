/**
 * Roles permitted to create and edit triggers.
 * Using a const object (not an enum) to stay compatible with erasableSyntaxOnly.
 */
export const TriggerManageRole = {
  ProjectEditor: 'project:editor',
  GlobalAdmin: 'global:admin',
  GlobalOwner: 'global:owner',
} as const;

export type TriggerManageRoleValue = (typeof TriggerManageRole)[keyof typeof TriggerManageRole];

const TRIGGER_MANAGE_ROLE_SET = new Set<string>(Object.values(TriggerManageRole));

/** Returns true if the given role slug has trigger create/edit permission. */
export function canManageTriggers(roleSlug: string | null | undefined): boolean {
  return roleSlug != null && TRIGGER_MANAGE_ROLE_SET.has(roleSlug);
}
