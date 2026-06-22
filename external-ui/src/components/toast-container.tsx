import { useToasts } from '../hooks/use-toasts';
import { IconX } from '@tabler/icons-react';

const variantStyles: Record<string, string> = {
  default: 'border-[var(--bc-border)] bg-[var(--bc-card)] text-[var(--bc-text)]',
  success: 'border-green-600 bg-green-50 text-green-800',
  error: 'border-red-600 bg-red-50 text-red-800',
};

export function ToastContainer() {
  const { toasts, dismiss } = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-md border p-4 shadow-lg ${variantStyles[t.variant] ?? variantStyles.default}`}
          role="alert"
        >
          <p className="flex-1 text-sm">{t.message}</p>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="text-current opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            <IconX size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
