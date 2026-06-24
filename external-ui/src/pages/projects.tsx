import { IconLogin2 } from '@tabler/icons-react';
import { login } from '../auth/session-actions';
import { AdminProjectsView } from '../components/projects/admin-projects-view';
import { UserProjectsView } from '../components/projects/user-projects-view';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuthUser, usePermissions } from '../state/session';

export function Projects() {
  const user = useAuthUser();
  const permissions = usePermissions();
  const isAdmin = permissions?.isAdmin ?? false;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">
      <section className="max-w-6xl space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--bc-text)] lg:text-4xl">Projects</h1>
          <p className="max-w-4xl text-base text-[var(--bc-muted)]">
            {isAdmin
              ? 'Manage project-to-tenant ID mappings for all n8n projects.'
              : 'View your CSTAR tenants and their associated project mappings.'}
          </p>
        </div>

        {user && isAdmin && <AdminProjectsView />}
        {user && !isAdmin && <UserProjectsView />}
        {!user && (
          <Alert>
            <AlertTitle>Sign in required</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <p className="text-sm text-[var(--bc-muted)]">Sign in to see your projects.</p>
                <Button onClick={login}>
                  <IconLogin2 size={16} aria-hidden="true" />
                  Sign In
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </section>
    </div>
  );
}
