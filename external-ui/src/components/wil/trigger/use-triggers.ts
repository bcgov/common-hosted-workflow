import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Trigger, TriggerPayload } from '../../../services/backend/trigger-types';
import { TRIGGER_TYPES } from '../../../constants/constants';
import { getTriggers } from '../../../services/backend/triggers';
import { toast } from '../../../hooks/use-toasts';
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<{ fn: () => void } | null>(null);

  const formState = useTriggerFormState({ isPersonalTenant, userEmail });
  const callbackStatus = useTriggerCallbackStatus();

  const { createMutation, updateMutation, callbackMutation, deleteMutation } = useTriggerMutations({
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
    onDeleted: (triggerId) => {
      setLocalTriggers((prev) => prev.filter((t) => t.id !== triggerId));
      setSelectedTriggerId(null);
      setFormMode('idle');
      toast.success('Trigger deleted successfully.');
    },
    onDeleteError: () => {
      toast.error('Failed to delete trigger. Please try again.');
    },
  });

  const hasUnsavedEdits = formState.hasUnsavedChanges && (formMode === 'edit' || formMode === 'create');

  /** Runs `action` immediately, or queues it behind the unsaved-changes dialog. */
  function guard(action: () => void) {
    if (hasUnsavedEdits) {
      setPendingNav({ fn: action });
    } else {
      action();
    }
  }

  function _doOpenCreate() {
    setSelectedTriggerId(null);
    setFormMode('create');
    formState.resetForCreate();
    callbackStatus.reset();
  }

  function openCreate() {
    guard(_doOpenCreate);
  }

  function openEdit(trigger: Trigger) {
    setSelectedTriggerId(trigger.id);
    setFormMode('edit');
    formState.loadForEdit(trigger);
    callbackStatus.reset();
  }

  function selectTrigger(trigger: Trigger, canManage: boolean) {
    const isSameTrigger = trigger.id === selectedTriggerId;
    // Already editing this exact trigger — do nothing.
    if (formMode === 'edit' && isSameTrigger) return;

    if (canManage) {
      guard(() => {
        if (!isSameTrigger) callbackStatus.reset();
        openEdit(trigger);
      });
      return;
    }

    // Non-manage users: view-only behaviour (unchanged).
    if (!isSameTrigger) callbackStatus.reset();
    setSelectedTriggerId(trigger.id);
    if (trigger.config.type === TRIGGER_TYPES.CHEFS_FORM) {
      setFormMode('view');
      return;
    }
    setFormMode('idle');
  }

  /** Opens the CHEFS form live-preview in the detail pane (used by the "Open Form" action button). */
  function openChefsPreview(trigger: Trigger) {
    const isSameTrigger = trigger.id === selectedTriggerId;
    guard(() => {
      if (!isSameTrigger) callbackStatus.reset();
      setSelectedTriggerId(trigger.id);
      setFormMode('view');
    });
  }

  function cancel() {
    setFormMode('idle');
    setSelectedTriggerId(null);
    formState.clearUnsavedChanges();
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
      formState.clearUnsavedChanges();
    } finally {
      setIsSaving(false);
    }
  }

  function requestDelete(trigger: Trigger) {
    setPendingDelete(trigger.id);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync(pendingDelete);
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  }

  function cancelDelete() {
    setPendingDelete(null);
  }

  function triggerCallback(trigger: Trigger) {
    guard(() => {
      setSelectedTriggerId(trigger.id);
      setFormMode('view');
      callbackStatus.start(trigger.id);
      callbackMutation.mutate(trigger.id);
    });
  }

  function confirmNavigation() {
    const nav = pendingNav;
    setPendingNav(null);
    formState.clearUnsavedChanges();
    nav?.fn();
  }

  function cancelNavigation() {
    setPendingNav(null);
  }

  function getFormPaneTitle(): string {
    if (formMode === 'create') return 'Create Trigger';
    if (formMode === 'edit') return 'Edit Trigger';
    if (formMode === 'view') {
      const t = triggers.find((tr) => tr.id === selectedTriggerId);
      if (t?.config.type === TRIGGER_TYPES.CHEFS_FORM) return t.config.formName || 'CHEFS Form';
      if (t?.config.type === TRIGGER_TYPES.BUTTON) return t.config.buttonText || 'Trigger';
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
    isDeleting,
    pendingDeleteTrigger: pendingDelete ? (triggers.find((t: Trigger) => t.id === pendingDelete) ?? null) : null,
    buttonCallbackStatus: callbackStatus.buttonCallbackStatus,
    buttonCallbackError: callbackStatus.buttonCallbackError,
    formPaneTitle: getFormPaneTitle(),
    hasPendingNav: pendingNav !== null,
    openCreate,
    openEdit,
    openChefsPreview,
    selectTrigger,
    cancel,
    changeTriggerType: formState.changeTriggerType,
    setChefsForm: formState.setChefsForm,
    setButtonForm: formState.setButtonForm,
    save,
    triggerCallback,
    requestDelete,
    confirmDelete,
    cancelDelete,
    confirmNavigation,
    cancelNavigation,
  };
}
