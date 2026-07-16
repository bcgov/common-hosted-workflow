import { IconBolt, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type {
  ChefsFormTriggerPayload,
  ButtonTriggerPayload,
  TriggerType,
  Trigger,
} from '../../../services/backend/trigger-types';
import { TRIGGER_TYPES } from '../../../constants/constants';
import { Select } from './trigger-shared';
import type { FormMode } from './trigger-shared';
import { ChefsFormFields } from './trigger-chefs-form';
import { ButtonTriggerFields } from './trigger-button-form';
import { TriggerChefsPreview } from './trigger-chefs-preview';
import { TriggerButtonResult } from './trigger-button-result';
import type { ButtonCallbackStatus } from './trigger-button-result';

interface TriggerFormPaneProps {
  mode: FormMode;
  triggerType: TriggerType | null;
  onTriggerTypeChange: (t: TriggerType) => void;
  chefsForm: ChefsFormTriggerPayload;
  onChefsFormChange: (v: ChefsFormTriggerPayload) => void;
  buttonForm: ButtonTriggerPayload;
  onButtonFormChange: (v: ButtonTriggerPayload) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  actorsLocked: boolean;
  selectedTrigger: Trigger | null;
  tenantId: string;
  buttonCallbackStatus: ButtonCallbackStatus;
  buttonCallbackError: Error | null;
}

export function TriggerFormPane({
  mode,
  triggerType,
  onTriggerTypeChange,
  chefsForm,
  onChefsFormChange,
  buttonForm,
  onButtonFormChange,
  onSave,
  onCancel,
  isSaving,
  actorsLocked,
  selectedTrigger,
  tenantId,
  buttonCallbackStatus,
  buttonCallbackError,
}: Readonly<TriggerFormPaneProps>) {
  if (mode === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
        <div className="rounded-full bg-[var(--bc-surface)] p-4">
          <IconBolt size={28} className="text-[var(--bc-muted)]" aria-hidden="true" />
        </div>
        <p className="text-sm text-[var(--bc-muted)]">Select a trigger from the list to view details.</p>
      </div>
    );
  }

  if (mode === 'view' && selectedTrigger?.config.type === TRIGGER_TYPES.CHEFS_FORM) {
    return <TriggerChefsPreview trigger={selectedTrigger} tenantId={tenantId} />;
  }

  if (mode === 'view' && selectedTrigger?.config.type === TRIGGER_TYPES.BUTTON) {
    return <TriggerButtonResult status={buttonCallbackStatus} error={buttonCallbackError} />;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="trigger-type">
          Trigger Type {mode === 'create' && <span className="text-red-500">*</span>}
        </Label>
        <Select
          id="trigger-type"
          value={triggerType ?? ''}
          onChange={(v) => onTriggerTypeChange(v as TriggerType)}
          disabled={mode === 'edit'}
        >
          <option value="" disabled>
            Select a trigger type...
          </option>
          <option value={TRIGGER_TYPES.CHEFS_FORM}>CHEFS Form</option>
          <option value={TRIGGER_TYPES.BUTTON}>Button</option>
        </Select>
      </div>
      {triggerType === TRIGGER_TYPES.CHEFS_FORM && (
        <ChefsFormFields
          value={chefsForm}
          onChange={onChefsFormChange}
          onSave={onSave}
          onCancel={onCancel}
          isSaving={isSaving}
          actorsLocked={actorsLocked}
          tenantId={tenantId}
        />
      )}
      {triggerType === TRIGGER_TYPES.BUTTON && (
        <ButtonTriggerFields
          value={buttonForm}
          onChange={onButtonFormChange}
          onSave={onSave}
          onCancel={onCancel}
          isSaving={isSaving}
          actorsLocked={actorsLocked}
          tenantId={tenantId}
        />
      )}
      {!triggerType && (
        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            <IconX size={16} aria-hidden="true" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
