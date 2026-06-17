import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import type { WilActionItem } from '../services/backend/wil';
import { IconLogin2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ActionDetailPane } from '@/components/action-detail-pane';
import {
  TenantSelector,
  DateFilter,
  computeSinceDate,
  StatusFilter,
  TabBar,
  ActionsTab,
  MessagesTab,
} from '@/components/wil';
import type { Tab } from '@/components/wil';

const ACTION_LIST_REFRESH_DELAY_MS = 1500;

export function WorkflowInteraction() {
  const { user, login } = useAuth();
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('actions');
  const [dateFilter, setDateFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string[]>(['pending']);
  const [actionsCursor, setActionsCursor] = useState<string | null>(null);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<WilActionItem | null>(null);

  const sinceDate = computeSinceDate(dateFilter);

  const onInteractionSuccess = useCallback(() => {
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
    }, ACTION_LIST_REFRESH_DELAY_MS);
  }, [queryClient]);

  function handleTenantChange(id: string) {
    setTenantId(id);
    setActionsCursor(null);
    setMessagesCursor(null);
    setSelectedAction(null);
  }

  function handleDateFilterChange(value: string | undefined) {
    setDateFilter(value);
    setActionsCursor(null);
    setMessagesCursor(null);
  }

  function handleStatusFilterChange(statuses: string[]) {
    setStatusFilter(statuses);
    setSelectedAction(null);
    setActionsCursor(null);
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    setSelectedAction(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">
      <section className="max-w-6xl space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--bc-text)] lg:text-4xl">
            Workflow Interaction
          </h1>
          <p className="max-w-4xl text-base text-[var(--bc-muted)]">
            View your assigned workflow actions and messages for a selected tenant.
          </p>
        </div>

        {user ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <TenantSelector tenantId={tenantId} onTenantChange={handleTenantChange} />
              <DateFilter selected={dateFilter} onChange={handleDateFilterChange} />
            </div>

            {tenantId ? (
              <div className="space-y-4">
                <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

                {activeTab === 'actions' ? (
                  <div className="space-y-5">
                    <StatusFilter selected={statusFilter} onChange={handleStatusFilterChange} />
                    <hr className="border-[var(--bc-border)] mt-4" />
                    <div className="grid grid-cols-[minmax(320px,420px)_1fr] gap-0 min-h-[500px] rounded-xl border border-[var(--bc-border)] bg-white shadow-sm overflow-hidden">
                      <div className="overflow-y-auto border-r border-[var(--bc-border)] p-4">
                        <ActionsTab
                          tenantId={tenantId}
                          since={sinceDate}
                          statusFilter={statusFilter}
                          cursor={actionsCursor}
                          onLoadMore={setActionsCursor}
                          selectedAction={selectedAction}
                          onSelectAction={setSelectedAction}
                        />
                      </div>
                      <div className="p-6 overflow-y-auto bg-[var(--bc-surface,#f8fafc)]">
                        <ActionDetailPane
                          action={selectedAction}
                          tenantId={tenantId}
                          onInteractionSuccess={onInteractionSuccess}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <MessagesTab
                    tenantId={tenantId}
                    since={sinceDate}
                    cursor={messagesCursor}
                    onLoadMore={setMessagesCursor}
                  />
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6 text-sm text-[var(--bc-muted)]">
                  Select a tenant above to view your actions and messages.
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Alert>
            <AlertTitle>Sign in required</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <p className="text-sm text-[var(--bc-muted)]">Sign in to view your workflow interactions.</p>
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
