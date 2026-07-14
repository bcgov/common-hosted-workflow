import type { WilActionItem } from '../../services/backend/wil';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { IconClock, IconPlayerPlay, IconAlertTriangle, IconHandGrab } from '@tabler/icons-react';

function ActionStatusBadge({ status }: Readonly<{ status: WilActionItem['status'] }>) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="secondary" className="gap-1">
          <IconClock size={12} aria-hidden="true" />
          Status: Pending
        </Badge>
      );
    case 'claimed':
      return (
        <Badge className="gap-1 bg-amber-100 text-amber-800 border-amber-200">
          <IconHandGrab size={12} aria-hidden="true" />
          Status: Claimed
        </Badge>
      );
    case 'in_progress':
      return (
        <Badge className="gap-1 bg-[var(--bc-blue)] text-white">
          <IconPlayerPlay size={12} aria-hidden="true" />
          Status: In Progress
        </Badge>
      );
    default:
      return <Badge variant="outline">Status: {status}</Badge>;
  }
}

function ActionPriorityBadge({ priority }: Readonly<{ priority: WilActionItem['priority'] }>) {
  if (priority === 'critical') {
    return (
      <Badge variant="destructive" className="gap-1">
        <IconAlertTriangle size={12} aria-hidden="true" />
        Priority: Critical
      </Badge>
    );
  }
  return <Badge variant="secondary">Priority: Normal</Badge>;
}

interface ActionItemProps {
  action: WilActionItem;
  isSelected?: boolean;
  onClick?: () => void;
}

export function ActionItem({ action, isSelected, onClick }: Readonly<ActionItemProps>) {
  const title = action.actionTitle || action.actionType;

  return (
    <Card
      className={`cursor-pointer transition-all duration-150 shadow-sm ${isSelected ? 'ring-2 ring-[var(--bc-blue)] border-[var(--bc-blue)]' : 'hover:border-[var(--bc-blue)]/50 hover:shadow-md'}`}
      onClick={onClick}
    >
      <CardContent className="space-y-3 p-4">
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-semibold leading-snug text-[var(--bc-text)] break-words">{title}</p>
          <p className="text-xs text-[var(--bc-muted)]">{new Date(action.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActionPriorityBadge priority={action.priority} />
          <ActionStatusBadge status={action.status} />
        </div>
      </CardContent>
    </Card>
  );
}
