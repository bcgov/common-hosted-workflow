import * as React from 'react';

import { cn } from '@/lib/utils';

function Alert({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'information';
}) {
  const variants = {
    default: 'border-border bg-surface text-foreground',
    destructive: 'border-danger bg-danger-surface text-danger-foreground',
    success: 'border-success bg-success-surface text-success-foreground',
    warning: 'border-warning bg-warning-surface text-warning-foreground',
    information: 'border-information bg-information-surface text-information-foreground',
  } as const;

  return (
    <div
      role="alert"
      className={cn('relative w-full rounded-card border p-4', variants[variant], className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-1 font-bold leading-5', className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
