import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { usePermissions, useSessionLoading } from '../state/session';
import type { Permissions } from '../services/backend/auth';

interface PermissionRouteProps {
  readonly permissionKey: keyof Permissions;
  readonly children: ReactNode;
}

export function PermissionRoute({ permissionKey, children }: PermissionRouteProps) {
  const permissions = usePermissions();
  const isLoading = useSessionLoading();

  if (isLoading) {
    return null;
  }

  if (!permissions?.[permissionKey]) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
