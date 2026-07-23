import type { ReactNode } from 'react';
import { login, logout } from '../auth/session-actions';
import { useAuthUser, usePermissions, useSessionLoading } from '../state/session';
import { ToastContainer } from '../components/toast-container';
import { AppHeader, type AppNavItem } from '@/components/layout/app-header';
import { AppFooter } from '@/components/layout/app-footer';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const user = useAuthUser();
  const permissions = usePermissions();
  const isLoading = useSessionLoading();
  const canRequestAccess = permissions?.canRequestAccess ?? false;
  const canReviewAccessRequests = permissions?.canReviewAccessRequests ?? false;
  const canViewWorkflows = permissions?.canViewWorkflows ?? false;
  const canManageWil = permissions?.canManageWil ?? false;
  const canManageProject = permissions?.canManageProject ?? false;
  const navItems: AppNavItem[] = [
    { to: '/', label: 'Home', end: true },
    ...(canViewWorkflows ? [{ to: '/workflows', label: 'Workflows' }] : []),
    ...(canManageWil ? [{ to: '/workflow-interaction', label: 'Workflow Interaction' }] : []),
    ...(canManageProject ? [{ to: '/projects', label: 'Projects' }] : []),
    ...(canRequestAccess ? [{ to: '/access-request', label: 'Access Request' }] : []),
    ...(canReviewAccessRequests ? [{ to: '/access-requests', label: 'Review Requests' }] : []),
  ];

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <ToastContainer />
      <AppHeader navItems={navItems} userEmail={user?.email} isLoading={isLoading} onLogin={login} onLogout={logout} />
      <main id="main-content" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
