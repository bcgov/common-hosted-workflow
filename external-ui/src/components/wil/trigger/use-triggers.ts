import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Trigger,
  TriggerPayload,
  TriggerType,
  ChefsFormTriggerPayload,
  ButtonTriggerPayload,
} from '../../../services/backend/triggers';
import { createTrigger, getTriggers, updateTrigger } from '../../../services/backend/triggers';
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
  // TODO: set enabled: Boolean(tenantId) once the endpoint is live.
  const triggersQuery = useQuery({
    queryKey: ['triggers', tenantId],
    queryFn: ({ signal }) => getTriggers({ tenantId, signal }),
    enabled: false, // TODO: flip to Boolean(tenantId) when backend is ready
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
  // TODO: swap mutationFn body for → return createTrigger({ tenantId, config });
  const createMutation = useMutation({
    mutationFn: async (config: TriggerPayload): Promise<Trigger> => {
      void createTrigger;
      return {
        id: `trigger-${Date.now()}`,
        tenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        config,
      };
    },
    onSuccess: (t) => {
      setLocalTriggers((prev) => [...prev, t]);
      setSelectedTriggerId(t.id);
      void queryClient.invalidateQueries({ queryKey: ['triggers', tenantId] });
    },
  });

  // Backend API: Update Trigger
  // TODO: swap mutationFn body for → return updateTrigger({ tenantId, triggerId, config });
  const updateMutation = useMutation({
    mutationFn: async ({ triggerId, config }: { triggerId: string; config: TriggerPayload }): Promise<Trigger> => {
      void updateTrigger;
      return {
        id: triggerId,
        tenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        config,
      };
    },
    onSuccess: (updated) => {
      setLocalTriggers((prev) =>
        prev.map((t) => (t.id === updated.id ? { ...t, updatedAt: updated.updatedAt, config: updated.config } : t)),
      );
      void queryClient.invalidateQueries({ queryKey: ['triggers', tenantId] });
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
    if (formMode !== 'edit' || trigger.id !== selectedTriggerId) {
      if (!canManage) setFormMode('idle');
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
    const payload = triggerType === 'chefs-form' ? chefsForm : triggerType === 'button' ? buttonForm : null;
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

  return {
    triggers,
    selectedTriggerId,
    formMode,
    triggerType,
    chefsForm,
    buttonForm,
    isSaving,
    formPaneTitle: formMode === 'create' ? 'Create Trigger' : formMode === 'edit' ? 'Edit Trigger' : 'Details',
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
