import { useState } from 'react';
import type {
  ButtonTriggerPayload,
  ChefsFormTriggerPayload,
  Trigger,
  TriggerType,
} from '../../../services/backend/trigger-types';
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
    if (trigger.config.type === 'chefs-form') {
      setTriggerType('chefs-form');
      setChefsForm({ ...trigger.config });
    } else {
      setTriggerType('button');
      setButtonForm({ ...trigger.config });
    }
  }

  function changeTriggerType(t: TriggerType) {
    setTriggerType(t);
    if (t === 'chefs-form') setChefsForm(freshChefsForm());
    if (t === 'button') setButtonForm(freshButtonForm());
  }

  let activePayload = null;
  if (triggerType === 'chefs-form') {
    activePayload = chefsForm;
  } else if (triggerType === 'button') {
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
