import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { login } from '../auth/session-actions';
import { getWhoami } from '../services/backend/auth';
import { useAuthUser } from '../state/session';
import { IconLogin2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export function Home() {
  const user = useAuthUser();
  const whoamiQuery = useQuery({
    queryKey: ['whoami', user?.email ?? ''],
    queryFn: ({ signal }) => getWhoami({ signal }),
    enabled: Boolean(user),
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

        <Card>
          <CardHeader>
            <CardTitle>Manage portal activity</CardTitle>
            <CardDescription>
              Use this portal to explore authenticated user access and verify backend integration points as the app
              grows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user ? (
              <Alert>
                <AlertTitle className="flex flex-wrap items-center gap-2">
                  Signed in as <span className="font-semibold">{user.email}</span>
                  {whoami?.n8nUser?.role ? <Badge variant="secondary">{whoami.n8nUser.role.slug}</Badge> : null}
                </AlertTitle>
                <AlertDescription>Authenticated session active.</AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertTitle>You are not signed in.</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button onClick={login}>
                      <IconLogin2 size={16} aria-hidden="true" />
                      Sign In
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {whoami ? (
              <Card className="overflow-hidden">
                <CardHeader className="border-b border-[var(--bc-border)] bg-[var(--bc-surface)] py-4">
                  <CardTitle className="text-sm">/ui-api/whoami</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-72">
                    <pre className="p-4 text-xs text-slate-700">{JSON.stringify(whoami, null, 2)}</pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : whoamiError ? (
              <Alert variant="destructive">
                <AlertTitle>whoami error</AlertTitle>
                <AlertDescription>{whoamiError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex gap-4 pt-1 text-sm font-medium">
              <Link to="/workflows" className="underline underline-offset-2 hover:text-[var(--bc-blue-dark)]">
                Workflows
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
