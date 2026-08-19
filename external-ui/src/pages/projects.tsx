import { IconLogin2 } from '@tabler/icons-react';
import { login } from '../auth/session-actions';
import { AdminProjectsView } from '../components/projects/admin-projects-view';
import { UserProjectsView } from '../components/projects/user-projects-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/patterns/page-header';
import { useAuthUser, usePermissions } from '../state/session';

export function Projects() {
  const user = useAuthUser();
  const permissions = usePermissions();
  const isAdmin = permissions?.isAdmin ?? false;

  return (
    <div className="min-h-[calc(100svh-var(--ds-header-height)-var(--ds-footer-height))] bg-surface-muted">
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            title="Projects"
            description={
              isAdmin
                ? 'Manage project-to-tenant ID mappings for all n8n projects.'
                : 'View your CSTAR tenants and their associated project mappings.'
            }
          />

          {user && isAdmin && <AdminProjectsView />}
          {user && !isAdmin && <UserProjectsView />}
          {!user && (
            <Alert>
              <AlertTitle>Sign in required</AlertTitle>
              <AlertDescription>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <p className="text-sm text-muted-foreground">Sign in to see your projects.</p>
                  <Button onClick={login}>
                    <IconLogin2 size={16} aria-hidden="true" />
                    Sign In
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </PageContainer>
    </div>
  );
}
