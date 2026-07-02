import { useState } from 'react';
import type {
  ButtonTriggerPayload,
  ChefsFormTriggerPayload,
  Trigger,
  TriggerType,
} from '../../../services/backend/trigger-types';
import { TRIGGER_TYPES } from '../../../constants/constants';
import { DEFAULT_CHEFS_FORM } from './trigger-chefs-form';
import { DEFAULT_BUTTON } from './trigger-button-form';
import { applyPersonalActorDefaults } from './trigger-utils';

interface UseTriggerFormStateOptions {
  isPersonalTenant: boolean;
  userEmail: string;
}

/** Owns the create/edit form's working field values. */
export function useTriggerFormState({ isPersonalTenant, userEmail }: UseTriggerFormStateOptions) {
  const freshChefsForm = (): ChefsFormTriggerPayload =>
    applyPersonalActorDefaults({ ...DEFAULT_CHEFS_FORM }, isPersonalTenant, userEmail);
  const freshButtonForm = (): ButtonTriggerPayload =>
    applyPersonalActorDefaults({ ...DEFAULT_BUTTON }, isPersonalTenant, userEmail);

  const [triggerType, setTriggerType] = useState<TriggerType | null>(null);
  const [chefsFormRaw, setChefsFormRaw] = useState<ChefsFormTriggerPayload>(freshChefsForm());
  const [buttonFormRaw, setButtonFormRaw] = useState<ButtonTriggerPayload>(freshButtonForm());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  function setChefsForm(v: ChefsFormTriggerPayload) {
    setChefsFormRaw(v);
    setHasUnsavedChanges(true);
  }

  function setButtonForm(v: ButtonTriggerPayload) {
    setButtonFormRaw(v);
    setHasUnsavedChanges(true);
  }

  function resetForCreate() {
    setTriggerType(null);
    setChefsFormRaw(freshChefsForm());
    setButtonFormRaw(freshButtonForm());
    setHasUnsavedChanges(false);
  }

  function loadForEdit(trigger: Trigger) {
    if (trigger.config.type === TRIGGER_TYPES.CHEFS_FORM) {
      setTriggerType(TRIGGER_TYPES.CHEFS_FORM);
      setChefsFormRaw({ ...trigger.config });
    } else {
      setTriggerType(TRIGGER_TYPES.BUTTON);
      setButtonFormRaw({ ...trigger.config });
    }
    setHasUnsavedChanges(false);
  }

  function changeTriggerType(t: TriggerType) {
    setTriggerType(t);
    if (t === TRIGGER_TYPES.CHEFS_FORM) setChefsFormRaw(freshChefsForm());
    if (t === TRIGGER_TYPES.BUTTON) setButtonFormRaw(freshButtonForm());
    setHasUnsavedChanges(true);
  }

  function clearUnsavedChanges() {
    setHasUnsavedChanges(false);
  }

  let activePayload = null;
  if (triggerType === TRIGGER_TYPES.CHEFS_FORM) {
    activePayload = chefsFormRaw;
  } else if (triggerType === TRIGGER_TYPES.BUTTON) {
    activePayload = buttonFormRaw;
  }

  return {
    triggerType,
    chefsForm: chefsFormRaw,
    buttonForm: buttonFormRaw,
    activePayload,
    hasUnsavedChanges,
    setChefsForm,
    setButtonForm,
    resetForCreate,
    loadForEdit,
    changeTriggerType,
    clearUnsavedChanges,
  };
}
