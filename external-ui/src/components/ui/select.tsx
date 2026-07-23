import * as React from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, children, ...props }, ref) => (
    <span className="relative inline-flex min-w-0">
      <select
        ref={ref}
        className={cn(
          'min-h-10 w-full appearance-none rounded-control border border-border-strong bg-surface py-2 pr-10 pl-3 text-sm text-foreground shadow-sm disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground disabled:opacity-100 aria-invalid:border-danger',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <IconChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  ),
);

Select.displayName = 'Select';

export { Select };
