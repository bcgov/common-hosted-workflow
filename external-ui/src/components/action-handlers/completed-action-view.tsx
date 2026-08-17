import type { WilActionItem } from '../../services/backend/wil';
import { CopyField } from '@/components/patterns/copy-field';
import { ActionDetailHeader } from './action-detail-header';

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function computeDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours} hours`;
}

function getOutputMessage(action: WilActionItem): string | null {
  if (action.status === 'completed') {
    if (action.actionType === 'showform') return 'Form submitted successfully.';
    if (action.actionType === 'getapproval') return 'Approval decision recorded.';
    return 'Action completed.';
  }
  if (action.status === 'cancelled') return 'Action was cancelled.';
  if (action.status === 'expired') return 'Action expired before completion.';
  if (action.status === 'deleted') return 'Action was deleted.';
  return null;
}

interface CompletedActionViewProps {
  action: WilActionItem;
}

export function CompletedActionView({ action }: Readonly<CompletedActionViewProps>) {
  const outputMessage = getOutputMessage(action);

  const startedAt = action.createdAt;
  const finishedAt = action.completedAt ?? action.updatedAt;
  const duration = computeDuration(startedAt, finishedAt);

  return (
    <div className="flex h-full flex-col gap-4.5 rounded-card border border-[#e2e8f0] bg-surface p-6">
      {/* Header: Title + Status badge */}
      <ActionDetailHeader action={action} />

      {/* Action ID */}
      <CopyField label="Action ID" value={action.id} />

      {/* Metadata rows */}
      <div className="flex flex-col gap-3">
        <MetadataRow label="Priority" value={action.priority === 'critical' ? 'Critical' : 'Normal'} />
        <MetadataRow label="Started by" value={action.actorId} />
        <MetadataRow label="Started" value={formatDateTime(startedAt)} />
        <MetadataRow label="Finished" value={formatDateTime(finishedAt)} />
        <MetadataRow label="Duration" value={duration} />
      </div>

      {/* Divider */}
      <hr className="border-[#e2e8f0]" />

      {/* Output section */}
      {outputMessage ? (
        <div className="space-y-2.5">
          <p className="text-sm font-bold text-foreground">Output</p>
          <div className="flex items-center justify-between rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3.5 py-3">
            <p className="text-sm text-[#334155]">{outputMessage}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetadataRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex gap-4">
      <span className="w-[150px] shrink-0 text-[13px] text-[#64748b]">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-foreground">{value}</span>
    </div>
  );
}
