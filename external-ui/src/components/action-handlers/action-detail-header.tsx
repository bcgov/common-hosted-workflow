import type { WilActionItem } from '../../services/backend/wil';

const STATUS_BADGE_STYLES: Record<string, string> = {
  pending: 'bg-[#fef9c3] text-[#854d0e] border border-[#fde047]',
  claimed: 'bg-[#fef3c7] text-[#92400e] border border-[#fcd34d]',
  in_progress: 'bg-[#f1f8fe] text-[#255a90] border border-[#91c4fa]',
  completed: 'bg-[#dcfce7] text-[#166534]',
  cancelled: 'bg-[#f1f5f9] text-[#475569]',
  expired: 'bg-[#fef3c7] text-[#92400e]',
  deleted: 'bg-[#fee2e2] text-[#991b1b]',
};

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatActionTitle(actionType: string): string {
  return actionType.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

interface ActionDetailHeaderProps {
  action: WilActionItem;
}

/**
 * Shared header for the action detail pane.
 * Shows: title · #id, optional description, status pill badge, and a divider.
 */
export function ActionDetailHeader({ action }: Readonly<ActionDetailHeaderProps>) {
  const title = action.actionTitle || formatActionTitle(action.actionType);
  const statusStyles = STATUS_BADGE_STYLES[action.status] ?? 'bg-[#f1f5f9] text-[#475569]';

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xl font-bold text-foreground">
            {title} &middot; #{action.id.slice(-4)}
          </p>
          {action.actionTitle && action.actionType !== action.actionTitle ? (
            <p className="text-sm text-muted-foreground">{action.actionType}</p>
          ) : null}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${statusStyles}`}>
          {formatStatusLabel(action.status)}
        </span>
      </div>
      <hr className="border-[#e2e8f0]" />
    </>
  );
}
