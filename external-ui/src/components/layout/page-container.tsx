import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

function PageContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[calc(var(--ds-content-max)+2*var(--ds-page-gutter))] px-[var(--ds-page-gutter)] py-8 sm:py-10',
        className,
      )}
      {...props}
    />
  );
}

export { PageContainer };
