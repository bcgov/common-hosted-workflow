import { IconRefresh } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

interface ClaimErrorViewProps {
  message: string;
  onRefresh: () => void;
}

/**
 * Shared UI block shown when a claim verification fails.
 * Displays the error message and a refresh button to reload the action state.
 */
export function ClaimErrorView({ message, onRefresh }: Readonly<ClaimErrorViewProps>) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
        {message}
      </div>
      <p className="text-sm text-[var(--bc-muted)]">Please refresh to see the current state of this action.</p>
      <Button variant="outline" onClick={onRefresh}>
        <IconRefresh size={14} aria-hidden="true" />
        Refresh
      </Button>
    </div>
  );
}
