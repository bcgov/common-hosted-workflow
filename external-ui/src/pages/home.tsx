import { Navigate } from 'react-router';
import { login } from '../auth/session-actions';
import { useAuthUser, usePermissions } from '../state/session';
import {
  IconActivity,
  IconArrowsRightLeft,
  IconCheckbox,
  IconFolder,
  IconSend,
  IconUsersGroup,
} from '@tabler/icons-react';
import { PageContainer } from '@/components/layout/page-container';
import { DashboardCard } from '@/components/patterns/dashboard-card';
import { EmptyState } from '@/components/patterns/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { SignedOutView } from '@/components/patterns/signed-out-view';

interface NavCard {
  to: string;
  icon: typeof IconArrowsRightLeft;
  title: string;
  description: string;
}

export function Home() {
  const user = useAuthUser();
  const permissions = usePermissions();

  // Ineligible sign-ins land here. Send them straight to the access-request page only
  // when that is all they can do; `ui:actor` portal users stay on the portal home.
  if (permissions?.canRequestAccess && !permissions.canManageWil) {
    return <Navigate to="/access-request" replace />;
  }

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

        {!user ? <SignedOutView onSignIn={login} /> : null}

        {cards.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <DashboardCard key={card.to} {...card} />
            ))}
          </div>
        ) : null}

        {/* Signed in with nothing to open (e.g. a BCeID user not yet in any tenant). */}
        {user && permissions && cards.length === 0 ? (
          <EmptyState
            icon={<IconUsersGroup aria-hidden="true" />}
            title="Join a tenant to get started"
            description="You need to be part of a tenant to use the Workflow User Portal. Ask your tenant administrator to add you, then sign in again."
          />
        ) : null}
      </PageContainer>
    </div>
  );
}
