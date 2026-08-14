import type { AriaAttributes, ComponentType } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

interface DashboardCardProps {
  to: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: AriaAttributes['aria-hidden'] }>;
  className?: string;
}

function DashboardCard({ to, title, description, icon: Icon, className }: Readonly<DashboardCardProps>) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col gap-3 rounded-card border border-border bg-surface p-5 text-foreground no-underline shadow-card transition-[border-color,box-shadow,transform] hover:border-primary hover:text-foreground hover:shadow-card-hover focus-visible:text-foreground',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-card bg-information-surface text-information">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <h2 className="text-lg leading-6 font-bold">{title}</h2>
      <p className="flex-1 text-sm leading-5 text-muted-foreground">{description}</p>
      <span className="text-[0.8125rem] font-bold text-primary">Open →</span>
    </Link>
  );
}

export { DashboardCard };
