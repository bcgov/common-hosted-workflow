/**
 * Roles permitted to create and edit triggers.
 * Using a const object (not an enum) to stay compatible with erasableSyntaxOnly.
 */
export const TriggerManageRole = {
  ProjectEditor: 'project:editor',
} as const;

export const TRIGGER_MANAGE_ROLE_VALUES: string[] = Object.values(TriggerManageRole);
