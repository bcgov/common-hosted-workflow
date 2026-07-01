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
  const [chefsForm, setChefsForm] = useState<ChefsFormTriggerPayload>(freshChefsForm());
  const [buttonForm, setButtonForm] = useState<ButtonTriggerPayload>(freshButtonForm());

  function resetForCreate() {
    setTriggerType(null);
    setChefsForm(freshChefsForm());
    setButtonForm(freshButtonForm());
  }

  function loadForEdit(trigger: Trigger) {
    if (trigger.config.type === TRIGGER_TYPES.CHEFS_FORM) {
      setTriggerType(TRIGGER_TYPES.CHEFS_FORM);
      setChefsForm({ ...trigger.config });
    } else {
      setTriggerType(TRIGGER_TYPES.BUTTON);
      setButtonForm({ ...trigger.config });
    }
  }

  function changeTriggerType(t: TriggerType) {
    setTriggerType(t);
    if (t === TRIGGER_TYPES.CHEFS_FORM) setChefsForm(freshChefsForm());
    if (t === TRIGGER_TYPES.BUTTON) setButtonForm(freshButtonForm());
  }

  let activePayload = null;
  if (triggerType === TRIGGER_TYPES.CHEFS_FORM) {
    activePayload = chefsForm;
  } else if (triggerType === TRIGGER_TYPES.BUTTON) {
    activePayload = buttonForm;
  }

  return {
    triggerType,
    chefsForm,
    buttonForm,
    activePayload,
    setChefsForm,
    setButtonForm,
    resetForCreate,
    loadForEdit,
    changeTriggerType,
  };
}
