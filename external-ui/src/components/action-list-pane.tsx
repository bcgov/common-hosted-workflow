import type { WilActionItem } from '../services/backend/wil';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { IconLoader2, IconClock, IconPlayerPlay, IconAlertTriangle } from '@tabler/icons-react';

interface ActionListPaneProps {
  actions: WilActionItem[];
  selectedAction: WilActionItem | null;
  onSelectAction: (action: WilActionItem) => void;
  isLoading?: boolean;
  error?: Error | null;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

function formatActionType(actionType: string): string {
  return actionType
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-z])([a-z]*)/gi, (_match, first: string, rest: string) => {
      return first.toUpperCase() + rest.toLowerCase();
    })
    .trim();
}

function ActionStatusBadge({ status }: Readonly<{ status: WilActionItem['status'] }>) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800 border-amber-200">
          <IconClock size={12} aria-hidden="true" />
          Pending
        </Badge>
      );
    case 'in_progress':
      return (
        <Badge className="gap-1 bg-blue-100 text-blue-800 border-blue-200">
          <IconPlayerPlay size={12} aria-hidden="true" />
          In Progress
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800 border-green-200">
          Completed
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="secondary" className="gap-1 bg-gray-100 text-gray-600 border-gray-200">
          Cancelled
        </Badge>
      );
    case 'expired':
      return (
        <Badge variant="secondary" className="gap-1 bg-orange-100 text-orange-800 border-orange-200">
          <IconAlertTriangle size={12} aria-hidden="true" />
          Expired
        </Badge>
      );
    case 'deleted':
      return (
        <Badge variant="secondary" className="gap-1 bg-red-100 text-red-800 border-red-200">
          Deleted
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

export function ActionListPane({
  actions,
  selectedAction,
  onSelectAction,
  isLoading,
  error,
}: Readonly<ActionListPaneProps>) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--bc-muted)]">
        <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />
        Loading actions...
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading actions</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (actions.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--bc-muted)]">No actions available.</p>;
  }

  const sortedActions = [...actions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-16rem)]">
      {sortedActions.map((action) => {
        const isSelected = selectedAction?.id === action.id;
        return (
          <Card
            key={action.id}
            className={`cursor-pointer transition-colors hover:bg-[var(--bc-surface)] ${
              isSelected ? 'ring-2 ring-[var(--bc-blue)]' : ''
            }`}
            onClick={() => onSelectAction(action)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectAction(action);
              }
            }}
            aria-pressed={isSelected}
          >
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[var(--bc-text)] truncate">
                  {formatActionType(action.actionType)}
                </span>
                <ActionPriorityBadge priority={action.priority} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <ActionStatusBadge status={action.status} />
                <span
                  className="text-xs text-[var(--bc-muted)] whitespace-nowrap"
                  title={new Date(action.createdAt).toISOString()}
                >
                  {formatRelativeTime(action.createdAt)}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
