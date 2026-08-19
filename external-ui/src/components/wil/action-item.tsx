import type { WilActionItem } from '../../services/backend/wil';

const STATUS_BADGE_STYLES: Record<string, string> = {
  completed: 'bg-[#dcfce7] text-[#166534]',
  pending: 'bg-[#fef9c3] text-[#854d0e]',
  claimed: 'bg-[#fef3c7] text-[#92400e]',
  in_progress: 'bg-[#dbeafe] text-[#1e40af]',
  cancelled: 'bg-[#f1f5f9] text-[#475569]',
  expired: 'bg-[#f1f5f9] text-[#475569]',
  deleted: 'bg-[#fee2e2] text-[#991b1b]',
};

const PRIORITY_BADGE_STYLES: Record<string, string> = {
  normal: 'bg-[#f1f5f9] text-[#475569]',
  critical: 'bg-[#fee2e2] text-[#991b1b]',
};

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatActorId(actorId: string): string {
  // Strip domain part if it's an email
  const atIndex = actorId.indexOf('@');
  return atIndex > 0 ? actorId.slice(0, atIndex) : actorId;
}

interface ActionItemProps {
  action: WilActionItem;
  isSelected?: boolean;
  onClick?: () => void;
}

export function ActionItem({ action, isSelected, onClick }: Readonly<ActionItemProps>) {
  const title = action.actionTitle || action.actionType;
  const statusStyles = STATUS_BADGE_STYLES[action.status] ?? 'bg-[#f1f5f9] text-[#475569]';
  const priorityStyles = PRIORITY_BADGE_STYLES[action.priority] ?? PRIORITY_BADGE_STYLES.normal;
  const priorityLabel = action.priority === 'critical' ? 'Critical' : 'Normal';

  return (
    <button
      type="button"
      className={`w-full cursor-pointer rounded-lg border px-3.5 py-3 text-left transition-colors ${
        isSelected
          ? 'border-[1.5px] border-primary bg-[#f5f8fc]'
          : 'border-[#e2e8f0] bg-surface hover:border-primary/40'
      }`}
      onClick={onClick}
      aria-pressed={isSelected}
    >
      {/* Row 1: Title + Status badge */}
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
          {title} &middot; #{action.id.slice(-4)}
        </p>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${statusStyles}`}>
          {formatStatusLabel(action.status)}
        </span>
      </div>

      {/* Row 2: Description / workflow name */}
      {action.actionTitle && action.actionType !== action.actionTitle ? (
        <p className="mt-1.5 text-[13px] text-[#334155]">{action.actionType}</p>
      ) : null}

      {/* Row 3: Actor · Time + Priority badge */}
      <div className="mt-1.5 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-[#94a3b8]">
          {formatActorId(action.actorId)} &middot; {formatTime(action.createdAt)}
        </p>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${priorityStyles}`}>{priorityLabel}</span>
      </div>
    </button>
  );
}
