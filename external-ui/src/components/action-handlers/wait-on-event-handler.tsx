import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { IconLoader2, IconCheck, IconAlertTriangle } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { postWilCallback } from '../../services/backend/wil';
import type { WilActionItem } from '../../services/backend/wil';
import { extractErrorMessage } from './shared/error-utils';

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
}

export function WaitOnEventHandler({ action, tenantId, onInteractionSuccess }: Readonly<WaitOnEventHandlerProps>) {
  const onInteractionSuccessRef = useRef(onInteractionSuccess);
  onInteractionSuccessRef.current = onInteractionSuccess;

  const eventMutation = useMutation({
    mutationFn: () => postWilCallback({ tenantId, actionId: action.id, body: { eventName: 'clicked' } }),
    onSuccess: () => {
      onInteractionSuccessRef.current?.();
    },
  });

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
