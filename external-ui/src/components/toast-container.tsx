import { useToasts } from '../hooks/use-toasts';
import { IconX } from '@tabler/icons-react';

const variantStyles: Record<string, string> = {
  default: 'border-information bg-information-surface text-information-foreground',
  success: 'border-success bg-success-surface text-success-foreground',
  error: 'border-danger bg-danger-surface text-danger-foreground',
};

export function ToastContainer() {
  const { toasts, dismiss } = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-card border p-4 shadow-dialog ${variantStyles[t.variant] ?? variantStyles.default}`}
          role="status"
        >
          <p className="flex-1 text-sm">{t.message}</p>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-current opacity-70 hover:opacity-100"
            aria-label="Dismiss notification"
          >
            <IconX size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
