import type { WilActionItem } from '../../services/backend/wil';
import { Badge } from '@/components/ui/badge';
import { IconCheck, IconX, IconClockOff, IconTrash } from '@tabler/icons-react';

interface CompletedActionViewProps {
  action: WilActionItem;
}

function formatActionType(actionType: string): string {
  return actionType
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-z])([a-z]*)/gi, (_match, first: string, rest: string) => {
      return first.toUpperCase() + rest.toLowerCase();
    })
    .trim();
}

function formatCompletionTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getPayloadSummary(action: WilActionItem): string | null {
  if (action.actionType === 'showform') {
    const formName = action.payload?.FormName;
    if (typeof formName === 'string' && formName.length > 0) {
      return `Form: ${formName}`;
    }
  }
  return null;
}

function StatusIcon({ status }: Readonly<{ status: WilActionItem['status'] }>) {
  switch (status) {
    case 'completed':
      return <IconCheck size={32} className="text-green-600" aria-hidden="true" />;
    case 'cancelled':
      return <IconX size={32} className="text-gray-500" aria-hidden="true" />;
    case 'expired':
      return <IconClockOff size={32} className="text-orange-600" aria-hidden="true" />;
    case 'deleted':
      return <IconTrash size={32} className="text-red-600" aria-hidden="true" />;
    default:
      return <IconCheck size={32} className="text-gray-500" aria-hidden="true" />;
  }
}

function StatusBadge({ status }: Readonly<{ status: WilActionItem['status'] }>) {
  switch (status) {
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

export function CompletedActionView({ action }: Readonly<CompletedActionViewProps>) {
  const payloadSummary = getPayloadSummary(action);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
      <StatusIcon status={action.status} />
      <StatusBadge status={action.status} />

      <p className="text-sm font-medium text-[var(--bc-text)]">{formatActionType(action.actionType)}</p>

      {action.completedBy && (
        <p className="text-xs text-[var(--bc-muted)]">
          Completed by <span className="font-medium text-[var(--bc-text)]">{action.completedBy}</span>
        </p>
      )}

      <p className="text-xs text-[var(--bc-muted)]">
        {action.completedAt ? formatCompletionTime(action.completedAt) : formatCompletionTime(action.updatedAt)}
      </p>

      {payloadSummary && <p className="text-xs text-[var(--bc-muted)]">{payloadSummary}</p>}
    </div>
  );
}
