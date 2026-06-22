/**
 * n8n project role slugs used for tenant-project synchronization.
 *
 * These match the CSTAR shared service role names exactly and correspond
 * to n8n's assignable team project roles.
 */

export const PROJECT_ROLE_EDITOR = 'project:editor' as const;
export const PROJECT_ROLE_VIEWER = 'project:viewer' as const;
export const PROJECT_ROLE_ADMIN = 'project:admin' as const;

/** Roles that can be assigned/managed by the tenant project sync process. */
export const MANAGED_PROJECT_ROLES = [PROJECT_ROLE_EDITOR, PROJECT_ROLE_VIEWER] as const;
export type ManagedProjectRole = (typeof MANAGED_PROJECT_ROLES)[number];

export function isManagedProjectRole(name: string): name is ManagedProjectRole {
  return (MANAGED_PROJECT_ROLES as readonly string[]).includes(name);
}
