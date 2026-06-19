const ADMIN_ROLE_SLUGS = new Set(['global:owner', 'global:admin']);

export type Permissions = {
  canRequestAccess: boolean;
  canReviewAccessRequests: boolean;
};

export function computePermissions(n8nUser: { disabled: boolean; role: { slug: string } | null } | null): Permissions {
  if (!n8nUser) {
    return {
      canRequestAccess: true,
      canReviewAccessRequests: false,
    };
  }

  const isAdmin = n8nUser.role != null && ADMIN_ROLE_SLUGS.has(n8nUser.role.slug);
  const hasNoRole = n8nUser.role == null;
  const isDisabled = n8nUser.disabled;

  return {
    canRequestAccess: isDisabled || hasNoRole,
    canReviewAccessRequests: isAdmin,
  };
}
