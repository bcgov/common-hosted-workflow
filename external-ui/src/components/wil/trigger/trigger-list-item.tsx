import { IconEdit, IconPlayerPlay, IconForms } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Trigger } from '../../../services/backend/trigger-types';

interface TriggerListItemProps {
  trigger: Trigger;
  isSelected: boolean;
  /** True for project:editor — shows the Edit button */
  canManage: boolean;
  /** True while this specific trigger's callback request is in flight */
  isCallbackPending: boolean;
  onClick: () => void;
  onEdit: () => void;
  onTriggerCallback: () => void;
}

export function TriggerListItem({
  trigger,
  isSelected,
  canManage,
  isCallbackPending,
  onClick,
  onEdit,
  onTriggerCallback,
}: Readonly<TriggerListItemProps>) {
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
        <div className="flex items-center gap-2 shrink-0">
          {trigger.config.type === 'chefs-form' ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onTriggerCallback();
              }}
            >
              <IconForms size={14} aria-hidden="true" />
              Open Form
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isCallbackPending}
              onClick={(e) => {
                e.stopPropagation();
                onTriggerCallback();
              }}
            >
              <IconPlayerPlay size={14} aria-hidden="true" />
              {isCallbackPending ? 'Triggering…' : 'Trigger'}
            </Button>
          )}
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
        </div>
      </CardContent>
    </Card>
  );
}
