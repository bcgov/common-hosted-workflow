import * as React from 'react';
import { cn } from '@/lib/utils';

function TabList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn('flex max-w-full gap-1 overflow-x-auto border-b border-border', className)}
      {...props}
    />
  );
}

interface TabTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

function TabTrigger({ className, selected, ...props }: Readonly<TabTriggerProps>) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={cn(
        'relative min-h-11 shrink-0 border-b-3 border-transparent px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground',
        selected && 'border-accent text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { TabList, TabTrigger };
