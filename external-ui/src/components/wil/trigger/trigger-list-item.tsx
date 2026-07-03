import { IconEdit, IconPlayerPlay, IconForms, IconTrash } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import type { Trigger } from '../../../services/backend/trigger-types';
import { TRIGGER_TYPES } from '../../../constants/constants';

interface TriggerListItemProps {
  trigger: Trigger;
  isSelected: boolean;
  /** True for project:editor — shows the Edit and Delete buttons */
  canManage: boolean;
  /** True while this specific trigger's callback request is in flight */
  isCallbackPending: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTriggerCallback: () => void;
}

export function TriggerListItem({
  trigger,
  isSelected,
  canManage,
  isCallbackPending,
  onClick,
  onEdit,
  onDelete,
  onTriggerCallback,
}: Readonly<TriggerListItemProps>) {
  const label =
    trigger.config.type === TRIGGER_TYPES.CHEFS_FORM
      ? trigger.config.formName || 'CHEFS Form Trigger'
      : trigger.config.buttonText || 'Button Trigger';
  const typeLabel = trigger.config.type === TRIGGER_TYPES.CHEFS_FORM ? 'CHEFS Form' : 'Button';

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
        <div className="flex items-center gap-1 shrink-0">
          {trigger.config.type === TRIGGER_TYPES.CHEFS_FORM ? (
            <Tooltip content="Open Form">
              <Button
                type="button"
                variant="default"
                size="icon"
                className="h-8 w-8"
                aria-label="Open Form"
                onClick={(e) => {
                  e.stopPropagation();
                  onTriggerCallback();
                }}
              >
                <IconForms size={15} aria-hidden="true" />
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content={isCallbackPending ? 'Triggering…' : 'Trigger'}>
              <Button
                type="button"
                variant="default"
                size="icon"
                className="h-8 w-8"
                aria-label="Trigger"
                disabled={isCallbackPending}
                onClick={(e) => {
                  e.stopPropagation();
                  onTriggerCallback();
                }}
              >
                <IconPlayerPlay size={15} aria-hidden="true" />
              </Button>
            </Tooltip>
          )}
          {canManage && (
            <>
              <Tooltip content="Edit">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Edit trigger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <IconEdit size={15} aria-hidden="true" />
                </Button>
              </Tooltip>
              <Tooltip content="Delete">
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Delete trigger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <IconTrash size={15} aria-hidden="true" />
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
