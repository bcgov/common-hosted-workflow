import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

function PageContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-content px-[var(--ds-page-gutter)] py-8 sm:py-10', className)}
      {...props}
    />
  );
}

export { PageContainer };
