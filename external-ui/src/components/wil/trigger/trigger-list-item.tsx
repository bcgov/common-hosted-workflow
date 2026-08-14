import { IconEdit, IconPlayerPlay, IconForms, IconTrash } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
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
    <button
      type="button"
      className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
        isSelected
          ? 'border-[1.5px] border-primary bg-[#f5f8fc]'
          : 'border-[#e2e8f0] bg-surface hover:border-primary/40'
      }`}
      onClick={onClick}
      aria-pressed={isSelected}
    >
      {/* Text content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-[#94a3b8]">{typeLabel}</p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {trigger.config.type === TRIGGER_TYPES.CHEFS_FORM ? (
          <Tooltip content="Open Form">
            <Button
              type="button"
              variant="default"
              size="icon"
              className="size-9"
              aria-label="Open Form"
              onClick={(e) => {
                e.stopPropagation();
                onTriggerCallback();
              }}
            >
              <IconForms size={16} aria-hidden="true" />
            </Button>
          </Tooltip>
        ) : (
          <Tooltip content={isCallbackPending ? 'Triggering…' : 'Trigger'}>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="size-9"
              aria-label="Trigger"
              disabled={isCallbackPending}
              onClick={(e) => {
                e.stopPropagation();
                onTriggerCallback();
              }}
            >
              <IconPlayerPlay size={16} aria-hidden="true" />
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
                className="size-9"
                aria-label="Edit trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <IconEdit size={16} aria-hidden="true" />
              </Button>
            </Tooltip>
            <Tooltip content="Delete">
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="size-9"
                aria-label="Delete trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <IconTrash size={16} aria-hidden="true" />
              </Button>
            </Tooltip>
          </>
        )}
      </div>
    </button>
  );
}
