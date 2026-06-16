import { useState } from 'react';
import axios from 'axios';
import { IconLoader2, IconCheck, IconAlertTriangle } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { postWilCallback } from '../../services/backend/wil';
import type { WilActionItem } from '../../services/backend/wil';

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

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const serverMessage =
      (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message ??
      (err.response?.data as { message?: string } | undefined)?.message;
    return serverMessage ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export function WaitOnEventHandler({ action, tenantId, onInteractionSuccess }: Readonly<WaitOnEventHandlerProps>) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isTerminal = TERMINAL_STATUSES.has(action.status);
  const isDisabled = isTerminal || isSubmitting || isSuccess;

  async function handleClick() {
    if (isDisabled) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await postWilCallback({ tenantId, actionId: action.id, body: { eventName: 'clicked' } });
      setIsSuccess(true);
      onInteractionSuccess?.();
    } catch (err: unknown) {
      const message = extractErrorMessage(err, 'An unexpected error occurred. Please try again.');
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
      <p className="text-sm text-[var(--bc-text)]">This action requires your acknowledgement to proceed.</p>

      <Button onClick={handleClick} disabled={isDisabled}>
        {isSubmitting && <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />}
        {isSuccess && <IconCheck size={16} aria-hidden="true" />}
        Confirm Event
      </Button>

      <div aria-live="polite">
        {isSuccess && (
          <p className="flex items-center gap-1.5 text-sm text-green-700">
            <IconCheck size={16} aria-hidden="true" />
            Event acknowledged successfully
          </p>
        )}

        {errorMessage && (
          <p className="flex items-center gap-1.5 text-sm text-red-600">
            <IconAlertTriangle size={16} aria-hidden="true" />
            {errorMessage}
          </p>
        )}
      </div>

      {isTerminal && <p className="text-xs text-[var(--bc-muted)]">This action is no longer active.</p>}
    </div>
  );
}
