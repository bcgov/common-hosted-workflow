import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { getWhoami } from '../services/backend/auth';

export function Home() {
  const { user, login } = useAuth();
  const whoamiQuery = useQuery({
    queryKey: ['whoami', user?.access_token ?? ''],
    queryFn: ({ signal }) => getWhoami({ signal }),
    enabled: Boolean(user?.access_token),
  });

  const whoami = whoamiQuery.data;
  const whoamiError = whoamiQuery.error instanceof Error ? whoamiQuery.error.message : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">
      <section className="max-w-5xl space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--bc-text)] lg:text-4xl">
            Welcome to the Workflow User Portal
          </h1>
          <p className="max-w-4xl text-base text-[var(--bc-muted)]">
            Manage workflows, user access, and related portal tasks in one place.
          </p>
        </div>

        <div className="rounded-md border border-[var(--bc-border)] bg-[var(--bc-card)] p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--bc-text)]">Manage portal activity</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--bc-muted)]">
                Use this portal to explore authenticated user access and verify backend integration points as the app
                grows.
              </p>
            </div>

            {user ? (
              <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                <div>
                  Signed in as <span className="font-semibold">{user.profile.email}</span>
                </div>
                {whoami?.n8nUser?.role ? (
                  <div className="mt-1 text-xs uppercase tracking-wide text-green-800">
                    n8n role: <span className="font-semibold">{whoami.n8nUser.role.slug}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--bc-border)] bg-[var(--bc-surface)] px-4 py-3">
                <p className="text-sm text-[var(--bc-muted)]">You are not signed in.</p>
                <button
                  onClick={login}
                  className="rounded bg-[var(--bc-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--bc-blue-dark)]"
                >
                  Sign In
                </button>
              </div>
            )}

            {whoami ? (
              <div className="overflow-hidden rounded-md border border-[var(--bc-border)] bg-white">
                <div className="border-b border-[var(--bc-border)] bg-slate-50 px-4 py-2 text-sm font-semibold text-[var(--bc-text)]">
                  /ui-api/whoami
                </div>
                <pre className="overflow-auto p-4 text-xs text-slate-700">{JSON.stringify(whoami, null, 2)}</pre>
              </div>
            ) : whoamiError ? (
              <p className="text-sm text-red-600">whoami error: {whoamiError}</p>
            ) : null}

            <div className="flex gap-4 pt-1 text-sm font-medium">
              <Link to="/workflows" className="underline underline-offset-2 hover:text-[var(--bc-blue-dark)]">
                Workflows
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
