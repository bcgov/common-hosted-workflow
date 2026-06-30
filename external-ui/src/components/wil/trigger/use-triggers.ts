import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Trigger, TriggerPayload } from '../../../services/backend/trigger-types';
import { getTriggers } from '../../../services/backend/triggers';
import type { FormMode } from './trigger-shared';
import { useTriggerMutations } from './use-trigger-mutations';
import { useTriggerFormState } from './use-trigger-form-state';
import { useTriggerCallbackStatus } from './use-trigger-callback-status';

interface UseTriggersOptions {
  tenantId: string;
  isPersonalTenant: boolean;
  userEmail: string;
}

export function useTriggers({ tenantId, isPersonalTenant, userEmail }: UseTriggersOptions) {
  const triggersQuery = useQuery({
    queryKey: ['triggers', tenantId],
    queryFn: ({ signal }) => getTriggers({ tenantId, signal }),
    enabled: Boolean(tenantId),
    retry: false,
  });

  const [localTriggers, setLocalTriggers] = useState<Trigger[]>([]);
  const triggers = triggersQuery.data?.data ?? localTriggers;

  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>('idle');
  const [isSaving, setIsSaving] = useState(false);

  const formState = useTriggerFormState({ isPersonalTenant, userEmail });
  const callbackStatus = useTriggerCallbackStatus();

  const { createMutation, updateMutation, callbackMutation } = useTriggerMutations({
    tenantId,
    userEmail,
    onCreated: (t) => {
      setLocalTriggers((prev) => [...prev, t]);
      setSelectedTriggerId(t.id);
    },
    onUpdated: (updated) => {
      setLocalTriggers((prev) =>
        prev.map((t) => (t.id === updated.id ? { ...t, updatedAt: updated.updatedAt, config: updated.config } : t)),
      );
    },
    onCallbackSuccess: callbackStatus.succeed,
    onCallbackError: callbackStatus.fail,
    onCallbackSettled: callbackStatus.settle,
  });

  function openCreate() {
    setSelectedTriggerId(null);
    setFormMode('create');
    formState.resetForCreate();
    callbackStatus.reset();
  }

  function openEdit(trigger: Trigger) {
    setSelectedTriggerId(trigger.id);
    setFormMode('edit');
    formState.loadForEdit(trigger);
    callbackStatus.reset();
  }

  function selectTrigger(trigger: Trigger, canManage: boolean) {
    const isSameTrigger = trigger.id === selectedTriggerId;
    setSelectedTriggerId(trigger.id);
    if (!isSameTrigger) callbackStatus.reset();
    // Keep edit mode when clicking the trigger already being edited
    if (formMode === 'edit' && isSameTrigger) return;
    // Show the live CHEFS form when a CHEFS form trigger is selected
    if (trigger.config.type === 'chefs-form') {
      setFormMode('view');
      return;
    }
    if (!canManage) {
      setFormMode('idle');
    }
  }

  function cancel() {
    setFormMode('idle');
    setSelectedTriggerId(null);
    callbackStatus.reset();
  }

  async function save() {
    const payload: TriggerPayload | null = formState.activePayload;
    if (!payload) return;
    setIsSaving(true);
    try {
      if (formMode === 'create') await createMutation.mutateAsync(payload);
      else if (formMode === 'edit' && selectedTriggerId)
        await updateMutation.mutateAsync({ triggerId: selectedTriggerId, config: payload });
      setFormMode('idle');
    } finally {
      setIsSaving(false);
    }
  }

  /** Fires a button trigger's callback and shows its pending/success/error result in the detail pane. */
  function triggerCallback(trigger: Trigger) {
    setSelectedTriggerId(trigger.id);
    setFormMode('view');
    callbackStatus.start(trigger.id);
    callbackMutation.mutate(trigger.id);
  }

  function getFormPaneTitle(): string {
    if (formMode === 'create') return 'Create Trigger';
    if (formMode === 'edit') return 'Edit Trigger';
    if (formMode === 'view') {
      const t = triggers.find((tr) => tr.id === selectedTriggerId);
      if (t?.config.type === 'chefs-form') return t.config.formName || 'CHEFS Form';
      if (t?.config.type === 'button') return t.config.buttonText || 'Trigger';
    }
    return 'Details';
  }

  return {
    triggers,
    selectedTriggerId,
    selectedTrigger: triggers.find((t) => t.id === selectedTriggerId) ?? null,
    callbackTriggerId: callbackStatus.callbackTriggerId,
    formMode,
    triggerType: formState.triggerType,
    chefsForm: formState.chefsForm,
    buttonForm: formState.buttonForm,
    isSaving,
    buttonCallbackStatus: callbackStatus.buttonCallbackStatus,
    buttonCallbackError: callbackStatus.buttonCallbackError,
    formPaneTitle: getFormPaneTitle(),
    openCreate,
    openEdit,
    selectTrigger,
    cancel,
    changeTriggerType: formState.changeTriggerType,
    setChefsForm: formState.setChefsForm,
    setButtonForm: formState.setButtonForm,
    save,
    triggerCallback,
  };
}
