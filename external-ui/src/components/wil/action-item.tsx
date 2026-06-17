import type { WilActionItem } from '../../services/backend/wil';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { IconClock, IconPlayerPlay, IconAlertTriangle } from '@tabler/icons-react';

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

interface ActionItemProps {
  action: WilActionItem;
  isSelected?: boolean;
  onClick?: () => void;
}

export function ActionItem({ action, isSelected, onClick }: Readonly<ActionItemProps>) {
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
