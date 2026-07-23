import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface InlineConfirmationProps extends HTMLAttributes<HTMLDivElement> {
  message: string;
  actions: ReactNode;
}

function InlineConfirmation({ message, actions, className, ...props }: Readonly<InlineConfirmationProps>) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-3 rounded-control border border-warning bg-warning-surface p-4 text-warning-foreground sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
      {...props}
    >
      <p className="text-sm leading-5">{message}</p>
      <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
    </div>
  );
}

export { InlineConfirmation };
