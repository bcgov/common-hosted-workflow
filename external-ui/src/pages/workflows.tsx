import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { getWorkflows } from '../services/backend/workflows';

export function Workflows() {
  const { user, login } = useAuth();
  const workflowsQuery = useQuery({
    queryKey: ['workflows', user?.access_token ?? ''],
    queryFn: ({ signal }) => getWorkflows({ signal }),
    enabled: Boolean(user?.access_token),
  });

  const workflows = workflowsQuery.data?.workflows ?? [];
  const workflowsError = workflowsQuery.error instanceof Error ? workflowsQuery.error.message : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">
      <section className="max-w-6xl space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--bc-text)] lg:text-4xl">Workflows</h1>
          <p className="max-w-4xl text-base text-[var(--bc-muted)]">
            Workflows you can view in n8n, with the email addresses associated to each project share.
          </p>
        </div>

        {!user ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--bc-border)] bg-[var(--bc-surface)] px-4 py-3">
            <p className="text-sm text-[var(--bc-muted)]">Sign in to see your workflows.</p>
            <button
              onClick={login}
              className="rounded bg-[var(--bc-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--bc-blue-dark)]"
            >
              Sign In
            </button>
          </div>
        ) : workflowsQuery.isLoading ? (
          <p className="text-sm text-[var(--bc-muted)]">Loading workflows...</p>
        ) : workflowsError ? (
          <p className="text-sm text-red-600">workflow error: {workflowsError}</p>
        ) : workflows.length === 0 ? (
          <div className="rounded-md border border-[var(--bc-border)] bg-[var(--bc-card)] p-6 text-sm text-[var(--bc-muted)]">
            No workflows found for this user.
          </div>
        ) : (
          <div className="space-y-4">
            {workflows.map((workflow) => (
              <article
                key={workflow.workflowId}
                className="rounded-md border border-[var(--bc-border)] bg-[var(--bc-card)] p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--bc-text)]">{workflow.workflowName}</h2>
                    <p className="mt-1 text-xs text-[var(--bc-muted)]">{workflow.workflowId}</p>
                  </div>
                  <div className="rounded-full bg-[var(--bc-surface)] px-3 py-1 text-xs font-medium text-[var(--bc-text)]">
                    {workflow.projectIds.length} project{workflow.projectIds.length === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--bc-muted)]">Projects</h3>
                    <ul className="mt-2 space-y-1 text-sm text-[var(--bc-text)]">
                      {workflow.projectIds.map((projectId) => (
                        <li key={projectId} className="font-mono text-xs break-all rounded bg-white px-3 py-2">
                          {projectId}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--bc-muted)]">
                      User emails
                    </h3>
                    <ul className="mt-2 space-y-1 text-sm text-[var(--bc-text)]">
                      {workflow.userEmails.map((email) => (
                        <li key={email} className="rounded bg-white px-3 py-2">
                          {email}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {user ? (
          <div className="flex gap-4 pt-1 text-sm font-medium">
            <Link to="/" className="underline underline-offset-2 hover:text-[var(--bc-blue-dark)]">
              Home
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
