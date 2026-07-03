import { IconLoader2, IconCircleCheck, IconAlertTriangle } from '@tabler/icons-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { extractErrorMessage } from './error-utils';

/**
 * Shared pending/success/error presentation used by both the CHEFS form panel
 * (ShowFormHandler, TriggerChefsPreview) and the button-trigger result view.
 */

export function StatusPending({ label }: Readonly<{ label: string }>) {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-sm text-[var(--bc-muted)]">
      <IconLoader2 size={20} className="animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function StatusSuccess({ title, message }: Readonly<{ title: string; message: string }>) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-sm" aria-live="polite">
      <IconCircleCheck size={32} className="text-green-600" aria-hidden="true" />
      <p className="font-medium text-[var(--bc-text)]">{title}</p>
      <p className="text-[var(--bc-muted)]">{message}</p>
    </div>
  );
}

interface ErrorAlertProps {
  title: string;
  error: unknown;
  fallback: string;
}

/** Alert-only — caller controls layout (full-page padding vs. inline `mb-4`). */
export function ErrorAlert({ title, error, fallback }: Readonly<ErrorAlertProps>) {
  return (
    <Alert variant="destructive">
      <IconAlertTriangle size={16} aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{extractErrorMessage(error, fallback)}</AlertDescription>
    </Alert>
  );
}

/** Full-pane error state — used when nothing else can be rendered (e.g. init failed). */
export function StatusError(props: Readonly<ErrorAlertProps>) {
  return (
    <div className="p-6" aria-live="polite">
      <ErrorAlert {...props} />
    </div>
  );
}
