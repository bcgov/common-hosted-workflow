import { IconArrowLeft } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

interface MobileDetailViewProps {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}

/**
 * Full-screen detail overlay for mobile viewports.
 * Shows a sticky header with a back button and title, then renders children below.
 */
export function MobileDetailView({ title, onBack, children }: Readonly<MobileDetailViewProps>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sticky back header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="shrink-0 -ml-2"
          aria-label="Back to list"
        >
          <IconArrowLeft size={18} aria-hidden="true" />
          <span className="ml-1 text-sm">Back</span>
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{title}</h2>
      </div>

      {/* Detail content */}
      <div className="flex-1 overflow-y-auto bg-surface-muted p-4">{children}</div>
    </div>
  );
}
