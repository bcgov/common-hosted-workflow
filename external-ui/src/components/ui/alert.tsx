import * as React from 'react';

import { cn } from '@/lib/utils';

function Alert({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' }) {
  const variants = {
    default: 'border-[var(--bc-border)] bg-white text-[var(--bc-text)]',
    destructive: 'border-red-200 bg-red-50 text-red-900',
  } as const;

  return (
    <div
      role="alert"
      className={cn('relative w-full rounded-lg border p-4', variants[variant], className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h5 className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
