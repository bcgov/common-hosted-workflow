import * as React from 'react';

import { cn } from '@/lib/utils';

function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'information';
}) {
  const variants = {
    default: 'border-primary bg-primary text-primary-foreground',
    secondary: 'border-border bg-surface-muted text-foreground',
    destructive: 'border-danger bg-danger-surface text-danger-foreground',
    outline: 'border-border-strong bg-surface text-foreground',
    success: 'border-success bg-success-surface text-success-foreground',
    warning: 'border-warning bg-warning-surface text-warning-foreground',
    information: 'border-information bg-information-surface text-information-foreground',
  } as const;

  return (
    <div
      className={cn(
        'inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-bold leading-4',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
