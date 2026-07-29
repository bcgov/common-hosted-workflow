import { login } from '../auth/session-actions';
import { useAuthUser, usePermissions } from '../state/session';
import { IconLogin2, IconActivity, IconArrowsRightLeft, IconCheckbox, IconFolder, IconSend } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageContainer } from '@/components/layout/page-container';
import { DashboardCard } from '@/components/patterns/dashboard-card';
import { PageHeader } from '@/components/patterns/page-header';

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
            icon: IconActivity,
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
            icon: IconCheckbox,
            title: 'Review Requests',
            description: 'Review pending access requests.',
          } satisfies NavCard,
        ]
      : []),
  ];

  return (
    <div className="min-h-[calc(100svh-var(--ds-header-height)-var(--ds-footer-height))] bg-surface-subtle">
      <PageContainer className="space-y-[var(--ds-section-gap)]">
        <PageHeader
          title="Workflow User Portal"
          description="Manage workflows, user access, and related portal tasks in one place."
        />

        {!user ? (
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
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <DashboardCard key={card.to} {...card} />
          ))}
        </div>
      </PageContainer>
    </div>
  );
}
