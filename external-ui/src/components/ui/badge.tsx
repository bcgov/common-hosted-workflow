import * as React from 'react';

import { cn } from '@/lib/utils';

function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'secondary' | 'destructive' | 'outline' }) {
  const variants = {
    default: 'border-transparent bg-[var(--bc-blue)] text-white',
    secondary: 'border-transparent bg-[var(--bc-surface)] text-[var(--bc-text)]',
    destructive: 'border-transparent bg-red-600 text-white',
    outline: 'text-[var(--bc-text)] border-[var(--bc-border)] bg-white',
  } as const;

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
