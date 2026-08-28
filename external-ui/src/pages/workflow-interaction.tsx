import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { IconChevronDown, IconArrowsShuffle2 } from '@tabler/icons-react';
import { login } from '../auth/session-actions';
import type { WilActionItem, WilTenantItem } from '../services/backend/wil';
import { getWilActionCounts } from '../services/backend/wil';
import { useAuthUser } from '../state/session';
import { isPersonalTenant } from '../lib/tenant';
import { Button } from '@/components/ui/button';
import { ActionDetailPane } from '@/components/action-detail-pane';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { SignedOutView } from '@/components/patterns/signed-out-view';
import { MobileDetailView } from '@/components/wil/mobile-detail-view';
import {
  TenantSelector,
  DateFilter,
  computeSinceDate,
  StatusFilter,
  TabBar,
  ActionsTab,
  MessagesTab,
  TriggersTab,
} from '@/components/wil';
import type { Tab } from '@/components/wil';
import { useIsMobile } from '../hooks/use-is-mobile';

const ACTION_LIST_REFRESH_DELAY_MS = 1500;

export function WorkflowInteraction() {
  const user = useAuthUser();
  const queryClient = useQueryClient();
  const tenantSelectRef = useRef<HTMLSelectElement>(null);
  const isMobile = useIsMobile();

  const [selectedTenant, setSelectedTenant] = useState<WilTenantItem | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('actions');
  const [dateFilter, setDateFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [selectedAction, setSelectedAction] = useState<WilActionItem | null>(null);

  const tenantId = selectedTenant?.id ?? '';
  const personalTenant = isPersonalTenant(selectedTenant);
  const sinceDate = computeSinceDate(dateFilter);

  const countsQuery = useQuery({
    queryKey: ['wil-action-counts', tenantId],
    queryFn: ({ signal }) => getWilActionCounts({ tenantId, signal }),
    enabled: Boolean(tenantId),
  });

  const onInteractionSuccess = useCallback(() => {
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
      queryClient.invalidateQueries({ queryKey: ['wil-action-counts'] });
    }, ACTION_LIST_REFRESH_DELAY_MS);
  }, [queryClient]);

  function handleTenantChange(tenant: WilTenantItem | null) {
    setSelectedTenant(tenant);
    setSelectedAction(null);
  }

  function handleDateFilterChange(value: string | undefined) {
    setDateFilter(value);
  }

  function handleStatusFilterChange(statuses: string[]) {
    setStatusFilter(statuses);
    setSelectedAction(null);
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    setSelectedAction(null);
  }

  function handleChooseTenant() {
    tenantSelectRef.current?.focus();
    tenantSelectRef.current?.click();
  }

  function handleBackFromDetail() {
    setSelectedAction(null);
  }

  // --- Mobile: show full-screen detail view when an action is selected ---
  if (isMobile && selectedAction && activeTab === 'actions') {
    const detailTitle = selectedAction.actionTitle || selectedAction.actionType;
    return (
      <div className="flex min-h-full flex-col bg-surface-muted">
        <MobileDetailView title={detailTitle} onBack={handleBackFromDetail}>
          <ActionDetailPane
            action={selectedAction}
            tenantId={tenantId}
            onInteractionSuccess={onInteractionSuccess}
            onActionUpdated={setSelectedAction}
          />
        </MobileDetailView>
      </div>
    );
  }

  function renderActionsContent() {
    if (isMobile) {
      // Mobile: single-column card list
      return (
        <div className="space-y-4">
          <StatusFilter selected={statusFilter} onChange={handleStatusFilterChange} counts={countsQuery.data?.counts} />
          <hr className="border-border" />
          <ActionsTab
            tenantId={tenantId}
            since={sinceDate}
            statusFilter={statusFilter}
            selectedAction={selectedAction}
            onSelectAction={setSelectedAction}
          />
        </div>
      );
    }

    // Desktop: split-pane layout
    return (
      <div className="space-y-5">
        <StatusFilter selected={statusFilter} onChange={handleStatusFilterChange} counts={countsQuery.data?.counts} />
        <hr className="border-border mt-4" />
        <div className="grid grid-cols-[minmax(320px,420px)_1fr] grid-rows-[1fr] gap-0 rounded-card border border-border bg-surface shadow-card min-h-[480px]">
          <div className="relative border-r border-border">
            <div className="absolute inset-0 overflow-y-auto p-4">
              <ActionsTab
                tenantId={tenantId}
                since={sinceDate}
                statusFilter={statusFilter}
                selectedAction={selectedAction}
                onSelectAction={setSelectedAction}
              />
            </div>
          </div>
          <div className="p-6">
            <ActionDetailPane
              action={selectedAction}
              tenantId={tenantId}
              onInteractionSuccess={onInteractionSuccess}
              onActionUpdated={setSelectedAction}
            />
          </div>
        </div>
      </div>
    );
  }

  function renderTabContent() {
    if (activeTab === 'actions') {
      return renderActionsContent();
    }
    if (activeTab === 'triggers') {
      return (
        <TriggersTab
          tenantId={tenantId}
          isPersonalTenant={personalTenant}
          userEmail={user?.email ?? ''}
          isMobile={isMobile}
        />
      );
    }
    return <MessagesTab tenantId={tenantId} since={sinceDate} />;
  }

  if (!user) {
    return (
      <div className="min-h-[calc(100svh-var(--ds-header-height)-var(--ds-footer-height))] bg-surface-muted">
        <PageContainer>
          <div className="space-y-6">
            <PageHeader
              title="Workflow Interaction"
              description="View and respond to workflow actions and messages assigned to your account for a selected tenant."
            />
            <SignedOutView onSignIn={login} />
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100svh-var(--ds-header-height)-var(--ds-footer-height))] bg-surface-muted">
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            title="Workflow Interaction"
            description="View and respond to workflow actions and messages assigned to your account for a selected tenant."
          />

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-[#e2e8f0] bg-surface px-4 py-3 md:gap-6 md:px-5 md:py-4">
            <TenantSelector tenantId={tenantId} onTenantChange={handleTenantChange} ref={tenantSelectRef} />
            <div className="hidden h-8 w-px bg-[#e2e8f0] sm:block" aria-hidden="true" />
            <DateFilter selected={dateFilter} onChange={handleDateFilterChange} />
          </div>

          {tenantId ? (
            <div className="space-y-4">
              <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
              {renderTabContent()}
            </div>
          ) : (
            <EmptyState
              className="border-[#e2e8f0]"
              icon={<IconArrowsShuffle2 size={28} aria-hidden="true" />}
              title="Select a tenant to view workflow actions"
              description="Once you choose a tenant, the pending actions and messages assigned to your account appear here. Use the Status filter to narrow the list."
              action={
                <Button onClick={handleChooseTenant}>
                  Choose tenant
                  <IconChevronDown size={14} aria-hidden="true" className="ml-1" />
                </Button>
              }
            />
          )}
        </div>
      </PageContainer>
    </div>
  );
}
