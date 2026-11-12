const ADMIN_ROLES = new Set(['global:owner', 'global:admin']);

export function isAdminRole(roleSlug: string | null | undefined): boolean {
  return roleSlug != null && ADMIN_ROLES.has(roleSlug);
}

/** n8n project role slugs, as stored on the project relation. */
export const PROJECT_ROLE_ADMIN = 'project:admin';
export const PROJECT_ROLE_EDITOR = 'project:editor';
export const PROJECT_ROLE_VIEWER = 'project:viewer';
export const PROJECT_ROLE_PERSONAL_OWNER = 'project:personalOwner';

const VIEWER_ROLE_LABELS: Record<string, string> = {
  [PROJECT_ROLE_ADMIN]: 'You are an admin',
  [PROJECT_ROLE_EDITOR]: 'You are an editor',
  [PROJECT_ROLE_VIEWER]: 'You are a viewer',
  [PROJECT_ROLE_PERSONAL_OWNER]: 'You are the owner',
};

/**
 * "You are an editor" style label for the viewer's project role. Null for
 * non-members (no relation) and unrecognized slugs.
 */
export function getViewerRoleLabel(viewerRole: string | null | undefined): string | null {
  if (viewerRole == null) {
    return null;
  }
  return VIEWER_ROLE_LABELS[viewerRole] ?? null;
}
