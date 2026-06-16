import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { getWilActions, getWilMessages, getWilTenants } from '../services/backend/wil';
import type { WilActionItem, WilMessageItem } from '../services/backend/wil';
import {
  IconLogin2,
  IconBell,
  IconPlayerPlay,
  IconAlertTriangle,
  IconClock,
  IconFilter,
  IconLoader2,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ActionDetailPane } from '@/components/action-detail-pane';

type Tab = 'actions' | 'messages';

const STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'cancelled', 'expired', 'deleted'] as const;

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function StatusFilter({
  selected,
  onChange,
}: Readonly<{
  selected: string[];
  onChange: (statuses: string[]) => void;
}>) {
  function toggleStatus(status: string) {
    if (selected.includes(status)) {
      if (selected.length > 1) {
        onChange(selected.filter((s) => s !== status));
      }
    } else {
      onChange([...selected, status]);
    }
  }

  return (
    <fieldset className="flex flex-wrap gap-1.5 border-0 p-0 m-0">
      <legend className="sr-only">Status filter</legend>
      {STATUS_OPTIONS.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => toggleStatus(status)}
          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
            selected.includes(status)
              ? 'bg-[var(--bc-blue)] text-white border-[var(--bc-blue)]'
              : 'bg-white text-[var(--bc-muted)] border-[var(--bc-border)] hover:border-[var(--bc-blue)]'
          }`}
          aria-pressed={selected.includes(status)}
        >
          {formatStatusLabel(status)}
        </button>
      ))}
    </fieldset>
  );
}

type DateFilterOption = {
  label: string;
  value: string | undefined;
};

const DATE_FILTER_OPTIONS: DateFilterOption[] = [
  { label: 'All', value: undefined },
  { label: 'Last 24h', value: '24h' },
  { label: 'Last 7d', value: '7d' },
  { label: 'Last 30d', value: '30d' },
];

function computeSinceDate(filter: string | undefined): string | undefined {
  if (!filter) return undefined;
  const now = new Date();
  switch (filter) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return undefined;
  }
}

function TenantSelector({
  tenantId,
  onTenantChange,
}: Readonly<{
  tenantId: string;
  onTenantChange: (id: string) => void;
}>) {
  const tenantsQuery = useQuery({
    queryKey: ['wil-tenants'],
    queryFn: ({ signal }) => getWilTenants(signal),
  });

  const tenants = tenantsQuery.data?.tenants ?? [];

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="tenant-select" className="text-sm font-medium text-[var(--bc-text)] whitespace-nowrap">
        Tenant:
      </label>
      <select
        id="tenant-select"
        value={tenantId}
        onChange={(e) => onTenantChange(e.target.value)}
        disabled={tenantsQuery.isLoading}
        className="h-9 min-w-48 rounded-md border border-[var(--bc-border)] bg-white px-3 text-sm text-[var(--bc-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bc-blue)]"
      >
        <option value="">{tenantsQuery.isLoading ? 'Loading tenants...' : 'Select a tenant'}</option>
        {tenants.map((tenant) => (
          <option key={tenant.id} value={tenant.id}>
            {tenant.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateFilter({
  selected,
  onChange,
}: Readonly<{
  selected: string | undefined;
  onChange: (value: string | undefined) => void;
}>) {
  return (
    <div className="flex items-center gap-2">
      <IconFilter size={16} className="text-[var(--bc-muted)]" aria-hidden="true" />
      <select
        aria-label="Date filter"
        value={selected ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-9 rounded-md border border-[var(--bc-border)] bg-white px-3 text-sm text-[var(--bc-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bc-blue)]"
      >
        {DATE_FILTER_OPTIONS.map((opt) => (
          <option key={opt.label} value={opt.value ?? ''}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TabBar({ activeTab, onTabChange }: Readonly<{ activeTab: Tab; onTabChange: (tab: Tab) => void }>) {
  return (
    <div className="flex gap-1 rounded-lg bg-[var(--bc-surface)] p-1" role="tablist">
      <button
        role="tab"
        aria-selected={activeTab === 'actions'}
        onClick={() => onTabChange('actions')}
        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          activeTab === 'actions'
            ? 'bg-white text-[var(--bc-text)] shadow-sm'
            : 'text-[var(--bc-muted)] hover:text-[var(--bc-text)]'
        }`}
      >
        Actions
      </button>
      <button
        role="tab"
        aria-selected={activeTab === 'messages'}
        onClick={() => onTabChange('messages')}
        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          activeTab === 'messages'
            ? 'bg-white text-[var(--bc-text)] shadow-sm'
            : 'text-[var(--bc-muted)] hover:text-[var(--bc-text)]'
        }`}
      >
        Messages
      </button>
    </div>
  );
}

function ActionStatusBadge({ status }: Readonly<{ status: WilActionItem['status'] }>) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="secondary" className="gap-1">
          <IconClock size={12} aria-hidden="true" />
          Pending
        </Badge>
      );
    case 'in_progress':
      return (
        <Badge className="gap-1 bg-[var(--bc-blue)] text-white">
          <IconPlayerPlay size={12} aria-hidden="true" />
          In Progress
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function ActionPriorityBadge({ priority }: Readonly<{ priority: WilActionItem['priority'] }>) {
  if (priority === 'critical') {
    return (
      <Badge variant="destructive" className="gap-1">
        <IconAlertTriangle size={12} aria-hidden="true" />
        Critical
      </Badge>
    );
  }
  return <Badge variant="secondary">Normal</Badge>;
}

function ActionItem({
  action,
  isSelected,
  onClick,
}: Readonly<{ action: WilActionItem; isSelected?: boolean; onClick?: () => void }>) {
  const title = (action.payload?.title as string) || action.actionType;
  const isOpen = action.status === 'pending' || action.status === 'in_progress';

  return (
    <Card
      className={`cursor-pointer transition-all duration-150 shadow-sm ${isSelected ? 'ring-2 ring-[var(--bc-blue)] border-[var(--bc-blue)]' : 'hover:border-[var(--bc-blue)]/50 hover:shadow-md'}`}
      onClick={onClick}
    >
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--bc-text)] truncate">{title}</span>
            {isOpen && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700 bg-green-50 rounded-full px-2 py-0.5">
                Open
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--bc-muted)]">{new Date(action.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ActionPriorityBadge priority={action.priority} />
          <ActionStatusBadge status={action.status} />
        </div>
      </CardContent>
    </Card>
  );
}

function ActionsTab({
  tenantId,
  since,
  statusFilter,
  cursor,
  onLoadMore,
  selectedAction,
  onSelectAction,
}: Readonly<{
  tenantId: string;
  since: string | undefined;
  statusFilter: string[];
  cursor: string | null;
  onLoadMore: (nextCursor: string) => void;
  selectedAction: WilActionItem | null;
  onSelectAction: (action: WilActionItem) => void;
}>) {
  const sinceParam = cursor ?? since;

  const actionsQuery = useQuery({
    queryKey: ['wil-actions', tenantId, sinceParam, statusFilter],
    queryFn: ({ signal }) => getWilActions({ tenantId, since: sinceParam, status: statusFilter, signal }),
    enabled: Boolean(tenantId),
  });

  if (actionsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--bc-muted)]">
        <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />
        Loading actions...
      </div>
    );
  }

  if (actionsQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading actions</AlertTitle>
        <AlertDescription>
          {actionsQuery.error instanceof Error ? actionsQuery.error.message : 'An error occurred'}
        </AlertDescription>
      </Alert>
    );
  }

  const data = actionsQuery.data;
  if (!data || data.data.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--bc-muted)]">No actions found.</p>;
  }

  const { nextCursor } = data;

  return (
    <div className="space-y-3">
      {data.data.map((action) => (
        <ActionItem
          key={action.id}
          action={action}
          isSelected={selectedAction?.id === action.id}
          onClick={() => onSelectAction(action)}
        />
      ))}
      {nextCursor ? (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => onLoadMore(nextCursor)}>
            Load More
          </Button>
        </div>
      ) : (
        <p className="pt-2 text-center text-xs text-[var(--bc-muted)]">All actions loaded.</p>
      )}
    </div>
  );
}

function MessageStatusBadge({ status }: Readonly<{ status: WilMessageItem['status'] }>) {
  if (status === 'active') {
    return <Badge className="gap-1 bg-[var(--bc-blue)] text-white">Active</Badge>;
  }
  return (
    <Badge variant="secondary" className="gap-1">
      Read
    </Badge>
  );
}

function MessageItem({ message }: Readonly<{ message: WilMessageItem }>) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <IconBell size={18} className="mt-0.5 shrink-0 text-[var(--bc-muted)]" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-[var(--bc-text)] truncate">{message.title}</span>
            <MessageStatusBadge status={message.status} />
          </div>
          <p className="text-sm text-[var(--bc-muted)] line-clamp-2">{message.body}</p>
          <p className="text-xs text-[var(--bc-muted)]">{new Date(message.createdAt).toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MessagesTab({
  tenantId,
  since,
  cursor,
  onLoadMore,
}: Readonly<{
  tenantId: string;
  since: string | undefined;
  cursor: string | null;
  onLoadMore: (nextCursor: string) => void;
}>) {
  const sinceParam = cursor ?? since;

  const messagesQuery = useQuery({
    queryKey: ['wil-messages', tenantId, sinceParam],
    queryFn: ({ signal }) => getWilMessages({ tenantId, since: sinceParam, signal }),
    enabled: Boolean(tenantId),
  });

  if (messagesQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--bc-muted)]">
        <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />
        Loading messages...
      </div>
    );
  }

  if (messagesQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading messages</AlertTitle>
        <AlertDescription>
          {messagesQuery.error instanceof Error ? messagesQuery.error.message : 'An error occurred'}
        </AlertDescription>
      </Alert>
    );
  }

  const data = messagesQuery.data;
  if (!data || data.data.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--bc-muted)]">No messages found.</p>;
  }

  const { nextCursor } = data;

  return (
    <div className="space-y-3">
      {data.data.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
      {nextCursor ? (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => onLoadMore(nextCursor)}>
            Load More
          </Button>
        </div>
      ) : (
        <p className="pt-2 text-center text-xs text-[var(--bc-muted)]">All messages loaded.</p>
      )}
    </div>
  );
}

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
