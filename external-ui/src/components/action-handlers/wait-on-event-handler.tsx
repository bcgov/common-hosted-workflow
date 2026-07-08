import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconLoader2, IconCheck, IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { postWilCallback, getWilVerifyClaim } from '../../services/backend/wil';
import type { WilActionItem } from '../../services/backend/wil';
import { extractErrorMessage } from '../shared/error-utils';

const TERMINAL_STATUSES: ReadonlySet<WilActionItem['status']> = new Set([
  'completed',
  'cancelled',
  'expired',
  'deleted',
]);

interface WaitOnEventHandlerProps {
  action: WilActionItem;
  tenantId: string;
  onInteractionSuccess?: () => void;
  onRefresh?: () => void;
}

export function WaitOnEventHandler({
  action,
  tenantId,
  onInteractionSuccess,
  onRefresh,
}: Readonly<WaitOnEventHandlerProps>) {
  const [claimError, setClaimError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const onInteractionSuccessRef = useRef(onInteractionSuccess);
  useEffect(() => {
    onInteractionSuccessRef.current = onInteractionSuccess;
  });

  // Verify claim on mount for role/group actions
  useEffect(() => {
    if (action.actorType !== 'role' && action.actorType !== 'group') return;
    let cancelled = false;
    getWilVerifyClaim({ tenantId, actionId: action.id })
      .then((result) => {
        if (!cancelled && !result.valid) {
          setClaimError('This action is no longer assigned to you. Another user may have unclaimed it.');
        }
      })
      .catch(() => {
        // Silently ignore verify errors on mount — the submit check will catch it
      });
    return () => {
      cancelled = true;
    };
  }, [action.id, action.actorType, tenantId]);

  const eventMutation = useMutation({
    mutationFn: async () => {
      // Pre-submit claim verification for role/group actions
      if (action.actorType === 'role' || action.actorType === 'group') {
        const result = await getWilVerifyClaim({ tenantId, actionId: action.id });
        if (!result.valid) {
          setClaimError('This action is no longer assigned to you. Another user may have unclaimed it.');
          throw new Error('Claim lost');
        }
      }
      return postWilCallback({ tenantId, actionId: action.id, body: { eventName: 'clicked' } });
    },
    onSuccess: () => {
      onInteractionSuccessRef.current?.();
    },
  });

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
    queryClient.invalidateQueries({ queryKey: ['wil-action-counts'] });
    onRefresh?.();
  }

  if (claimError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {claimError}
        </div>
        <p className="text-sm text-[var(--bc-muted)]">Please refresh to see the current state of this action.</p>
        <Button variant="outline" onClick={handleRefresh}>
          <IconRefresh size={14} aria-hidden="true" />
          Refresh
        </Button>
      </div>
    );
  }

  const isTerminal = TERMINAL_STATUSES.has(action.status);
  const isDisabled = isTerminal || eventMutation.isPending || eventMutation.isSuccess;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
      <p className="text-sm text-[var(--bc-text)]">This action requires your acknowledgement to proceed.</p>

      <Button onClick={() => eventMutation.mutate()} disabled={isDisabled}>
        {eventMutation.isPending && <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />}
        {eventMutation.isSuccess && <IconCheck size={16} aria-hidden="true" />}
        Confirm Event
      </Button>

      <div aria-live="polite">
        {eventMutation.isSuccess && (
          <p className="flex items-center gap-1.5 text-sm text-green-700">
            <IconCheck size={16} aria-hidden="true" />
            Event acknowledged successfully
          </p>
        )}

        {eventMutation.isError && (
          <p className="flex items-center gap-1.5 text-sm text-red-600">
            <IconAlertTriangle size={16} aria-hidden="true" />
            {extractErrorMessage(eventMutation.error, 'An unexpected error occurred. Please try again.')}
          </p>
        )}
      </div>

      {isTerminal && <p className="text-xs text-[var(--bc-muted)]">This action is no longer active.</p>}
    </div>
  );
}
