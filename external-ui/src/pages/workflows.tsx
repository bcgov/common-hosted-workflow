import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/auth-context';
import { getWorkflows, shareWorkflow, unshareWorkflow } from '../services/backend/workflows';

export function Workflows() {
  const { user, login } = useAuth();
  const queryClient = useQueryClient();
  const [sharingWorkflowId, setSharingWorkflowId] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState('');

  const workflowsQuery = useQuery({
    queryKey: ['workflows', user?.access_token ?? ''],
    queryFn: ({ signal }) => getWorkflows({ signal }),
    enabled: Boolean(user?.access_token),
  });

  const shareMutation = useMutation({
    mutationFn: ({ workflowId, email }: { workflowId: string; email: string }) => shareWorkflow(workflowId, email),
    onSuccess: async () => {
      setSharingWorkflowId(null);
      setShareEmail('');
      await queryClient.invalidateQueries({ queryKey: ['workflows', user?.access_token ?? ''] });
    },
  });

  const unshareMutation = useMutation({
    mutationFn: ({ workflowId, projectId }: { workflowId: string; projectId: string }) =>
      unshareWorkflow(workflowId, projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workflows', user?.access_token ?? ''] });
    },
  });

  const workflows = workflowsQuery.data?.workflows ?? [];
  const currentRoleSlug = workflowsQuery.data?.n8nUser?.role?.slug ?? null;
  const canShareWorkflows = currentRoleSlug === 'global:owner' || currentRoleSlug === 'global:admin';
  const workflowsError = workflowsQuery.error instanceof Error ? workflowsQuery.error.message : null;
  const sharingWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.workflowId === sharingWorkflowId) ?? null,
    [sharingWorkflowId, workflows],
  );

  function openShareDialog(workflowId: string) {
    setSharingWorkflowId(workflowId);
    setShareEmail('');
    shareMutation.reset();
  }

  function closeShareDialog() {
    setSharingWorkflowId(null);
    setShareEmail('');
    shareMutation.reset();
  }

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
            {workflows.map((workflow) => {
              const canRemoveProjects = workflow.projectShares.length > 1;
              return (
                <article
                  key={workflow.workflowId}
                  className="rounded-md border border-[var(--bc-border)] bg-[var(--bc-card)] p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-[var(--bc-text)]">{workflow.workflowName}</h2>
                      <p className="mt-1 text-xs text-[var(--bc-muted)]">{workflow.workflowId}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-[var(--bc-surface)] px-3 py-1 text-xs font-medium text-[var(--bc-text)]">
                        {workflow.projectIds.length} project{workflow.projectIds.length === 1 ? '' : 's'}
                      </div>
                      {canShareWorkflows ? (
                        <button
                          type="button"
                          onClick={() => openShareDialog(workflow.workflowId)}
                          className="rounded bg-[var(--bc-blue)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--bc-blue-dark)]"
                        >
                          Share
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 overflow-hidden rounded border border-[var(--bc-border)] bg-white">
                    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] border-b border-[var(--bc-border)] bg-[var(--bc-surface)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--bc-muted)]">
                      <div>Project</div>
                      <div>User emails</div>
                      <div className="text-right">Action</div>
                    </div>
                    {workflow.projectShares.map((projectShare) => (
                      <div
                        key={projectShare.projectId}
                        className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-start gap-3 border-b border-[var(--bc-border)] px-3 py-3 last:border-b-0"
                      >
                        <div className="min-w-0 font-mono text-xs break-all text-[var(--bc-text)]">
                          {projectShare.projectId}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {projectShare.userEmails.length ? (
                            projectShare.userEmails.map((email) => (
                              <span
                                key={email}
                                className="rounded-full bg-[var(--bc-surface)] px-2 py-1 text-xs text-[var(--bc-text)]"
                              >
                                {email}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-[var(--bc-muted)]">No users</span>
                          )}
                        </div>
                        <div className="flex justify-end">
                          {canShareWorkflows && canRemoveProjects ? (
                            <button
                              type="button"
                              onClick={() =>
                                unshareMutation.mutate({
                                  workflowId: workflow.workflowId,
                                  projectId: projectShare.projectId,
                                })
                              }
                              disabled={unshareMutation.isPending}
                              className="shrink-0 rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {sharingWorkflow && canShareWorkflows ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-[var(--bc-text)]">Share workflow</h2>
                <p className="text-sm text-[var(--bc-muted)]">{sharingWorkflow.workflowName}</p>
              </div>

              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  shareMutation.mutate({ workflowId: sharingWorkflow.workflowId, email: shareEmail.trim() });
                }}
              >
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[var(--bc-text)]">Email</span>
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={(event) => setShareEmail(event.target.value)}
                    className="w-full rounded border border-[var(--bc-border)] px-3 py-2 text-sm"
                    placeholder="person@example.com"
                    autoFocus
                  />
                </label>

                {shareMutation.error instanceof Error ? (
                  <p className="text-sm text-red-600">{shareMutation.error.message}</p>
                ) : null}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeShareDialog}
                    className="rounded border border-[var(--bc-border)] px-4 py-2 text-sm font-semibold text-[var(--bc-text)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={shareMutation.isPending || !shareEmail.trim()}
                    className="rounded bg-[var(--bc-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--bc-blue-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Share
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

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
