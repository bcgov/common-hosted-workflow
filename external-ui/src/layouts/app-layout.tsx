import type { ReactNode } from 'react';
import { login, logout, openN8n } from '../auth/session-actions';
import { useAuthUser, usePermissions, useSession, useSessionLoading } from '../state/session';
import { ToastContainer } from '../components/toast-container';
import { AppHeader, type AppNavItem } from '@/components/layout/app-header';
import { AppFooter } from '@/components/layout/app-footer';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const session = useSession();
  const user = useAuthUser();
  const permissions = usePermissions();
  const isLoading = useSessionLoading();
  const canRequestAccess = permissions?.canRequestAccess ?? false;
  const canReviewAccessRequests = permissions?.canReviewAccessRequests ?? false;
  const canViewWorkflows = permissions?.canViewWorkflows ?? false;
  const canManageWil = permissions?.canManageWil ?? false;
  const canManageProject = permissions?.canManageProject ?? false;
  // Defense in depth only: button affordance is not the security boundary.
  // Direct n8n access remains protected by server-side n8n-auth cookie / session
  // authorization. Visibility is derived from the authoritative session contract
  // for an eligible n8n identity: n8nUser exists, is not disabled, and has a
  // role. Must not use canViewWorkflows or any custom-UI feature flag as proxy.
  const canOpenN8n = !isLoading && !!session?.n8nUser && !session.n8nUser.disabled && !!session.n8nUser.role?.slug;
  const navItems: AppNavItem[] = [
    ...(canViewWorkflows ? [{ to: '/workflows', label: 'Workflows' }] : []),
    ...(canManageWil ? [{ to: '/workflow-interaction', label: 'Workflow Interaction' }] : []),
    ...(canManageProject ? [{ to: '/projects', label: 'Projects' }] : []),
    ...(canRequestAccess ? [{ to: '/access-request', label: 'Access Request' }] : []),
    ...(canReviewAccessRequests ? [{ to: '/access-requests', label: 'Review Requests' }] : []),
  ];

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <ToastContainer />
      <AppHeader
        navItems={navItems}
        userEmail={user?.email}
        isLoading={isLoading}
        canOpenN8n={canOpenN8n}
        onLogin={login}
        onLogout={logout}
        onOpenN8n={openN8n}
      />
      <main id="main-content" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
