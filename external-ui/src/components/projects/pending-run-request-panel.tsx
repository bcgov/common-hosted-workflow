import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toasts';
import {
  formatCount,
  formatShortDate,
  formatWeeklyKeyRange,
  getEffectiveYearlyLimit,
  getEffectiveWeeklyLimit,
} from '@/lib/rate-limit';
import { cancelRunRequest, type PendingRunRequest, type ProjectItem } from '../../services/backend/projects';

const KIND_LABELS: Record<PendingRunRequest['requestKind'], string> = {
  extra_runs: 'Extra runs for one week',
  limit_increase: 'A higher limit',
};

const VANCOUVER_TIME_ZONE = 'America/Vancouver';

function formatRequestTime(createdAt: string): string {
  const date = new Date(createdAt);
  const timeText = new Intl.DateTimeFormat('en-US', {
    timeZone: VANCOUVER_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  const dayText = new Intl.DateTimeFormat('en-CA', {
    timeZone: VANCOUVER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const todayText = new Intl.DateTimeFormat('en-CA', {
    timeZone: VANCOUVER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return dayText === todayText ? `today at ${timeText}` : `${formatShortDate(date)} at ${timeText}`;
}

/** "You asked for 5,000 extra runs for Nov 2 to 8" / "… 12,000 runs a week and 600,000 a year". */
function getRequestedText(request: PendingRunRequest): string {
  if (request.requestKind === 'extra_runs') {
    const range = request.periodKey ? ` for ${formatWeeklyKeyRange(request.periodKey)}` : '';
    return `You asked for ${formatCount(request.extraRuns ?? 0)} extra runs${range}`;
  }
  const parts: string[] = [];
  if (request.requestedWeeklyLimit !== null) {
    parts.push(`${formatCount(request.requestedWeeklyLimit)} runs a week`);
  }
  if (request.requestedAnnualLimit !== null) {
    parts.push(`${formatCount(request.requestedAnnualLimit)} a year`);
  }
  return `You asked for a higher limit: ${parts.join(' and ')}`;
}

function getLimitsText(project: ProjectItem, request: PendingRunRequest): string {
  if (request.requestKind === 'extra_runs') {
    const weekly = getEffectiveWeeklyLimit(project);
    return weekly !== null
      ? `Until then, your weekly limit stays at ${formatCount(weekly)}.`
      : 'Until then, your limits stay as they are.';
  }
  const parts: string[] = [];
  const weekly = getEffectiveWeeklyLimit(project);
  const yearly = getEffectiveYearlyLimit(project);
  if (request.requestedWeeklyLimit !== null || weekly !== null) {
    parts.push(weekly === null ? 'no weekly limit' : `${formatCount(weekly)} a week`);
  }
  if (request.requestedAnnualLimit !== null || yearly !== null) {
    parts.push(yearly === null ? 'no annual limit' : `${formatCount(yearly)} a year`);
  }
  return `Until then, your limits stay at ${parts.join(' and ')}.`;
}

function getCancelErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    if (status === 404) return 'The request is no longer pending';
    if (status === 403) return 'Only the requester can cancel this request';
  }
  return 'Network error';
}

export interface PendingRunRequestPanelProps {
  project: ProjectItem;
  request: PendingRunRequest;
  /** The viewer's n8n user id, for the "by you" byline. */
  viewerUserId?: string | null;
}

/**
 * Member-view panel for the project's pending "Request more runs" submission:
 * what was asked, the reason, and a cancel action while it waits for review.
 */
export function PendingRunRequestPanel({ project, request, viewerUserId }: PendingRunRequestPanelProps) {
  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: () => cancelRunRequest(project.projectId, request.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['project', project.projectId] });
      toast.success('Request cancelled');
    },
    onError: (error) => toast.error(getCancelErrorMessage(error)),
  });

  const byline =
    viewerUserId != null && request.requestedBy === viewerUserId
      ? ` · sent ${formatRequestTime(request.createdAt)} by you`
      : ` · sent ${formatRequestTime(request.createdAt)}`;

  return (
    <div className="rounded-card border border-[#c1ddfc] bg-[#f6fbfe] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="warning">Pending review</Badge>
            <span>
              {KIND_LABELS[request.requestKind]}
              {byline}
            </span>
          </p>
          <p className="text-sm font-semibold text-foreground">{getRequestedText(request)}</p>
          <p className="text-sm text-muted-foreground">
            A platform admin will review it. We'll email you when they decide. {getLimitsText(project, request)}
          </p>
          <div className="mt-2 space-y-0.5 rounded-card border border-border bg-surface p-3">
            <p className="text-xs text-muted-foreground">Your reason</p>
            <p className="text-sm text-foreground">{request.reason}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => cancelMutation.mutate()}
          disabled={cancelMutation.isPending}
        >
          Cancel request
        </Button>
      </div>
    </div>
  );
}
