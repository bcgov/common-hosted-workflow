import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps extends HTMLAttributes<HTMLElement> {
  title: string;
  description?: string;
  actions?: ReactNode;
}

function PageHeader({ title, description, actions, className, ...props }: Readonly<PageHeaderProps>) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)} {...props}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-[2rem] leading-10 font-bold text-foreground">{title}</h1>
        {description ? <p className="max-w-4xl text-sm leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{actions}</div> : null}
    </header>
  );
}

export { PageHeader };
