import { Link } from 'react-router';
import { login } from '../auth/session-actions';
import { useAuthUser, usePermissions } from '../state/session';
import {
  IconLogin2,
  IconArrowsRightLeft,
  IconPlugConnected,
  IconFolder,
  IconSend,
  IconClipboardCheck,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface NavCard {
  to: string;
  icon: typeof IconArrowsRightLeft;
  title: string;
  description: string;
}

export function Home() {
  const user = useAuthUser();
  const permissions = usePermissions();

  const cards: NavCard[] = [
    ...(permissions?.canViewWorkflows
      ? [
          {
            to: '/workflows',
            icon: IconArrowsRightLeft,
            title: 'Workflows',
            description: 'View and manage workflows shared with you.',
          } satisfies NavCard,
        ]
      : []),
    ...(permissions?.canManageWil
      ? [
          {
            to: '/workflow-interaction',
            icon: IconPlugConnected,
            title: 'Workflow Interaction',
            description: 'Interact with active workflow instances.',
          } satisfies NavCard,
        ]
      : []),
    ...(permissions?.canManageProject
      ? [
          {
            to: '/projects',
            icon: IconFolder,
            title: 'Projects',
            description: 'View and manage project-to-tenant mappings.',
          } satisfies NavCard,
        ]
      : []),
    ...(permissions?.canRequestAccess
      ? [
          {
            to: '/access-request',
            icon: IconSend,
            title: 'Access Request',
            description: 'Request access to additional workflows.',
          } satisfies NavCard,
        ]
      : []),
    ...(permissions?.canReviewAccessRequests
      ? [
          {
            to: '/access-requests',
            icon: IconClipboardCheck,
            title: 'Review Requests',
            description: 'Review pending access requests.',
          } satisfies NavCard,
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">
      <section className="max-w-5xl space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--bc-text)] lg:text-4xl">
            Workflow User Portal
          </h1>
          <p className="max-w-4xl text-base text-[var(--bc-muted)]">
            Manage workflows, user access, and related portal tasks in one place.
          </p>
        </div>

        {user ? (
          <Alert>
            <AlertTitle className="flex flex-wrap items-center gap-2">
              Signed in as <span className="font-semibold">{user.email}</span>
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.to} to={card.to}>
                <Card className="h-full transition-colors hover:border-[var(--bc-blue)] hover:shadow-md">
                  <CardHeader className="space-y-1 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--bc-blue)]/10 text-[var(--bc-blue)]">
                        <Icon size={22} aria-hidden="true" />
                      </div>
                      <CardTitle className="text-lg">{card.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{card.description}</CardDescription>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
