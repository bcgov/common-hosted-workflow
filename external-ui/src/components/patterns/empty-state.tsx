import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

function EmptyState({ icon, title, description, action, className, ...props }: Readonly<EmptyStateProps>) {
  return (
    <div
      className={cn(
        'flex min-h-60 w-full flex-col items-center justify-center rounded-card border border-border bg-surface px-10 py-14 text-center',
        className,
      )}
      {...props}
    >
      {icon ? (
        <div className="mb-3.5 flex size-14 items-center justify-center rounded-full bg-information-surface text-information">
          {icon}
        </div>
      ) : null}
      <h2 className="text-xl leading-7 font-bold text-foreground">{title}</h2>
      <p className="mt-1 max-w-[560px] text-[15px] leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
