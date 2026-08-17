import { Button } from '@/components/ui/button';
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
  const runLabel = 'Run';

  return (
    <button
      type="button"
      className={`flex w-full flex-col rounded-lg text-left transition-colors ${
        isSelected
          ? 'border-[1.5px] border-[#013366] bg-[#F1F8FE]'
          : 'border border-[#e2e8f0] bg-white hover:border-[#013366]/40'
      }`}
      onClick={onClick}
      aria-pressed={isSelected}
    >
      {/* Title and type badge */}
      <div className="px-3.5 pt-3 pb-2">
        <p className="truncate text-sm font-bold text-foreground">{label}</p>
        <span className="mt-1.5 inline-block rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-0.5 text-xs text-[#64748b]">
          {typeLabel}
        </span>
      </div>

      {/* Action buttons row */}
      {canManage && (
        <div className="flex items-center border-t border-[#e2e8f0] px-3.5 py-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#013366] text-[#013366] hover:bg-[#013366]/5"
              disabled={isCallbackPending}
              onClick={(e) => {
                e.stopPropagation();
                onTriggerCallback();
              }}
            >
              {runLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#013366] text-[#013366] hover:bg-[#013366]/5"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              Edit
            </Button>
          </div>
          <div className="ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#ce3e39] text-[#a2312d] hover:bg-[#ce3e39]/5"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Run button only for non-managers */}
      {!canManage && (
        <div className="flex items-center border-t border-[#e2e8f0] px-3.5 py-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#013366] text-[#013366] hover:bg-[#013366]/5"
            disabled={isCallbackPending}
            onClick={(e) => {
              e.stopPropagation();
              onTriggerCallback();
            }}
          >
            {runLabel}
          </Button>
        </div>
      )}
    </button>
  );
}
