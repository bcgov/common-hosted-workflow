import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

function FilterBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-card border border-border bg-surface-subtle p-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-5',
        className,
      )}
      {...props}
    />
  );
}

export { FilterBar };
