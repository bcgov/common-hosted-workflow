import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Trigger,
  TriggerPayload,
  TriggerType,
  ChefsFormTriggerPayload,
  ButtonTriggerPayload,
} from '../../../services/backend/triggers';
import { getTriggers, createTrigger, updateTrigger } from '../../../services/backend/triggers';
import type { FormMode } from './trigger-shared';
import { DEFAULT_CHEFS_FORM } from './trigger-chefs-form';
import { DEFAULT_BUTTON } from './trigger-button-form';
import { applyPersonalActorDefaults } from './trigger-utils';

interface UseTriggersOptions {
  tenantId: string;
  isPersonalTenant: boolean;
  userEmail: string;
}

export function useTriggers({ tenantId, isPersonalTenant, userEmail }: UseTriggersOptions) {
  const queryClient = useQueryClient();

  // Backend API: List Triggers
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
  const [triggerType, setTriggerType] = useState<TriggerType | null>(null);
  const [chefsForm, setChefsForm] = useState<ChefsFormTriggerPayload>(
    applyPersonalActorDefaults({ ...DEFAULT_CHEFS_FORM }, isPersonalTenant, userEmail),
  );
  const [buttonForm, setButtonForm] = useState<ButtonTriggerPayload>(
    applyPersonalActorDefaults({ ...DEFAULT_BUTTON }, isPersonalTenant, userEmail),
  );
  const [isSaving, setIsSaving] = useState(false);

  // Backend API: Create Trigger
  const createMutation = useMutation({
    mutationFn: (config: TriggerPayload) => createTrigger({ tenantId, config }),
    onSuccess: (t) => {
      setLocalTriggers((prev) => [...prev, t]);
      setSelectedTriggerId(t.id);
      queryClient.invalidateQueries({ queryKey: ['triggers', tenantId] });
    },
  });

  // Backend API: Update Trigger
  const updateMutation = useMutation({
    mutationFn: ({ triggerId, config }: { triggerId: string; config: TriggerPayload }) =>
      updateTrigger({ tenantId, triggerId, config }),
    onSuccess: (updated) => {
      setLocalTriggers((prev) =>
        prev.map((t) => (t.id === updated.id ? { ...t, updatedAt: updated.updatedAt, config: updated.config } : t)),
      );
      queryClient.invalidateQueries({ queryKey: ['triggers', tenantId] });
    },
  });

  function openCreate() {
    setSelectedTriggerId(null);
    setFormMode('create');
    setTriggerType(null);
    setChefsForm(applyPersonalActorDefaults({ ...DEFAULT_CHEFS_FORM }, isPersonalTenant, userEmail));
    setButtonForm(applyPersonalActorDefaults({ ...DEFAULT_BUTTON }, isPersonalTenant, userEmail));
  }

  function openEdit(trigger: Trigger) {
    setSelectedTriggerId(trigger.id);
    setFormMode('edit');
    if (trigger.config.type === 'chefs-form') {
      setTriggerType('chefs-form');
      setChefsForm({ ...trigger.config });
    } else {
      setTriggerType('button');
      setButtonForm({ ...trigger.config });
    }
  }

  function selectTrigger(trigger: Trigger, canManage: boolean) {
    setSelectedTriggerId(trigger.id);
    if (!canManage && (formMode !== 'edit' || trigger.id !== selectedTriggerId)) {
      setFormMode('idle');
    }
  }

  function cancel() {
    setFormMode('idle');
    setTriggerType(null);
    setSelectedTriggerId(null);
  }

  function changeTriggerType(t: TriggerType) {
    setTriggerType(t);
    if (t === 'chefs-form') {
      setChefsForm(applyPersonalActorDefaults({ ...DEFAULT_CHEFS_FORM }, isPersonalTenant, userEmail));
    }
    if (t === 'button') {
      setButtonForm(applyPersonalActorDefaults({ ...DEFAULT_BUTTON }, isPersonalTenant, userEmail));
    }
  }

  async function save() {
    let payload: TriggerPayload | null = null;
    if (triggerType === 'chefs-form') {
      payload = chefsForm;
    } else if (triggerType === 'button') {
      payload = buttonForm;
    }
    if (!payload) return;
    setIsSaving(true);
    try {
      if (formMode === 'create') await createMutation.mutateAsync(payload);
      else if (formMode === 'edit' && selectedTriggerId)
        await updateMutation.mutateAsync({ triggerId: selectedTriggerId, config: payload });
      setFormMode('idle');
      setTriggerType(null);
    } finally {
      setIsSaving(false);
    }
  }

  function getFormPaneTitle(): string {
    if (formMode === 'create') return 'Create Trigger';
    if (formMode === 'edit') return 'Edit Trigger';
    return 'Details';
  }

  return {
    triggers,
    selectedTriggerId,
    formMode,
    triggerType,
    chefsForm,
    buttonForm,
    isSaving,
    formPaneTitle: getFormPaneTitle(),
    openCreate,
    openEdit,
    selectTrigger,
    cancel,
    changeTriggerType,
    setChefsForm,
    setButtonForm,
    save,
  };
}
