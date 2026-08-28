import { IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { TRIGGER_TYPES } from '../../../constants/constants';
import { TriggerListItem } from './trigger-list-item';
import type { Trigger } from '../../../services/backend/trigger-types';

interface TriggerListContentProps {
  canManage: boolean;
  visibleTriggers: Trigger[];
  selectedTriggerId: string | null;
  callbackTriggerId: string | null;
  openCreate: () => void;
  selectTrigger: (trigger: Trigger, canManage: boolean) => void;
  requestDelete: (trigger: Trigger) => void;
  openChefsPreview: (trigger: Trigger) => void;
  triggerCallback: (trigger: Trigger) => void;
}

export function TriggerListContent({
  canManage,
  visibleTriggers,
  selectedTriggerId,
  callbackTriggerId,
  openCreate,
  selectTrigger,
  requestDelete,
  openChefsPreview,
  triggerCallback,
}: Readonly<TriggerListContentProps>) {
  return (
    <>
      {canManage && (
        <Button type="button" className="w-full" onClick={openCreate}>
          <IconPlus size={16} aria-hidden="true" />
          Create Trigger
        </Button>
      )}
      {visibleTriggers.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--bc-muted)]">No triggers found.</p>
      ) : (
        visibleTriggers.map((trigger) => (
          <TriggerListItem
            key={trigger.id}
            trigger={trigger}
            isSelected={selectedTriggerId === trigger.id}
            canManage={canManage}
            isCallbackPending={callbackTriggerId === trigger.id}
            onClick={() => selectTrigger(trigger, canManage)}
            onEdit={() => selectTrigger(trigger, canManage)}
            onDelete={() => requestDelete(trigger)}
            onTriggerCallback={() => {
              if (trigger.config.type === TRIGGER_TYPES.CHEFS_FORM) {
                openChefsPreview(trigger);
              } else {
                triggerCallback(trigger);
              }
            }}
          />
        ))
      )}
    </>
  );
}
