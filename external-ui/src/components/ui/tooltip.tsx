import { cloneElement, isValidElement, useId, type ReactElement } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: string;
  children: ReactElement<{ 'aria-describedby'?: string }>;
  className?: string;
}

export function Tooltip({ content, children, className }: Readonly<TooltipProps>) {
  const tooltipId = useId();
  const trigger = isValidElement(children)
    ? cloneElement(children, {
        'aria-describedby': [children.props['aria-describedby'], tooltipId].filter(Boolean).join(' '),
      })
    : children;

  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {trigger}
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 max-w-64 -translate-x-1/2 rounded-control bg-foreground px-2.5 py-1.5 text-center text-xs leading-4 text-white opacity-0 shadow-card transition-opacity delay-300 duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
