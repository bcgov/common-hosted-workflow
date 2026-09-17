import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconLoader2, IconCheck, IconAlertTriangle } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { postWilCallback } from '../../services/backend/wil';
import type { WilActionItem, WilCallbackResponse } from '../../services/backend/wil';
import { extractErrorMessage, isServerUnavailableError, SERVER_UNAVAILABLE_MESSAGE } from '../shared/error-utils';
import { useClaimVerification, verifyClaimBeforeSubmit } from './use-claim-verification';
import { ClaimErrorView } from './claim-error-view';
import { buildCancelledActionSnapshot, buildCompletedActionSnapshot } from './cancelled-action';

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
  onActionUpdated?: (action: WilActionItem | null) => void;
}

export function WaitOnEventHandler({
  action,
  tenantId,
  onInteractionSuccess,
  onRefresh,
  onActionUpdated,
}: Readonly<WaitOnEventHandlerProps>) {
  const { claimError, setClaimError } = useClaimVerification({
    tenantId,
    actionId: action.id,
    actorType: action.actorType,
  });
  const queryClient = useQueryClient();
  const onInteractionSuccessRef = useRef(onInteractionSuccess);
  const onActionUpdatedRef = useRef(onActionUpdated);
  useEffect(() => {
    onInteractionSuccessRef.current = onInteractionSuccess;
    onActionUpdatedRef.current = onActionUpdated;
  });

  const eventMutation = useMutation<WilCallbackResponse, Error, void>({
    mutationFn: async () => {
      // Pre-submit claim verification for role/group actions
      const valid = await verifyClaimBeforeSubmit({
        tenantId,
        actionId: action.id,
        actorType: action.actorType,
        setClaimError,
      });
      if (!valid) throw new Error('Claim lost');
      return postWilCallback({ tenantId, actionId: action.id, body: { eventName: 'clicked' } });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
      queryClient.invalidateQueries({ queryKey: ['wil-action-counts'] });
      // The callback target was gone (e.g. finished n8n execution); the action was
      // auto-cancelled server-side. Flip the pane to the cancelled view (carrying the
      // reason) so the user sees why it was cancelled.
      if (result.cancelled) {
        onActionUpdatedRef.current?.(buildCancelledActionSnapshot(action, result));
        return;
      }
      // Event acknowledged: the action is completed server-side. Flip the pane to the
      // terminal (completed) view so claim/unclaim controls are no longer shown.
      onActionUpdatedRef.current?.(buildCompletedActionSnapshot(action));
      onInteractionSuccessRef.current?.();
    },
  });

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
    queryClient.invalidateQueries({ queryKey: ['wil-action-counts'] });
    onRefresh?.();
  }

  if (claimError) {
    return <ClaimErrorView message={claimError} onRefresh={handleRefresh} />;
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
            {isServerUnavailableError(eventMutation.error)
              ? SERVER_UNAVAILABLE_MESSAGE
              : extractErrorMessage(eventMutation.error, 'An unexpected error occurred. Please try again.')}
          </p>
        )}
      </div>

      {isTerminal && <p className="text-xs text-[var(--bc-muted)]">This action is no longer active.</p>}
    </div>
  );
}
