const ADMIN_ROLES = new Set(['global:owner', 'global:admin']);

export function isAdminRole(roleSlug: string | null | undefined): boolean {
  return roleSlug != null && ADMIN_ROLES.has(roleSlug);
}
