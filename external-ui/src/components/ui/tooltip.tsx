import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: Readonly<TooltipProps>) {
  return (
    <div className={cn('relative group/tip inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity delay-300 duration-150 group-hover/tip:opacity-100 z-50"
      >
        {content}
      </span>
    </div>
  );
}
