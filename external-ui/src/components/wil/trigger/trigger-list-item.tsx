import { IconEdit } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Trigger } from '../../../services/backend/triggers';

interface TriggerListItemProps {
  trigger: Trigger;
  isSelected: boolean;
  /** True for project:editor, global:admin, global:owner — shows the Edit button */
  canManage: boolean;
  onClick: () => void;
  onEdit: () => void;
}

export function TriggerListItem({ trigger, isSelected, canManage, onClick, onEdit }: Readonly<TriggerListItemProps>) {
  const label =
    trigger.config.type === 'chefs-form'
      ? trigger.config.formName || 'CHEFS Form Trigger'
      : trigger.config.buttonText || 'Button Trigger';
  const typeLabel = trigger.config.type === 'chefs-form' ? 'CHEFS Form' : 'Button';

  return (
    <Card
      className={`cursor-pointer transition-all duration-150 shadow-sm ${isSelected ? 'ring-2 ring-[var(--bc-blue)] border-[var(--bc-blue)]' : 'hover:border-[var(--bc-blue)]/50 hover:shadow-md'}`}
      onClick={onClick}
    >
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-[var(--bc-text)] truncate">{label}</p>
          <p className="text-xs text-[var(--bc-muted)]">{typeLabel}</p>
        </div>
        {canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <IconEdit size={14} aria-hidden="true" />
            Edit
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
