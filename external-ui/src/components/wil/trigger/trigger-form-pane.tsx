import { IconBolt, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ChefsFormTriggerPayload, ButtonTriggerPayload, TriggerType } from '../../../services/backend/triggers';
import { Select } from './trigger-shared';
import type { FormMode } from './trigger-shared';
import { ChefsFormFields } from './trigger-chefs-form';
import { ButtonTriggerFields } from './trigger-button-form';

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

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="trigger-type">
          Trigger Type <span className="text-red-500">*</span>
        </Label>
        <Select id="trigger-type" value={triggerType ?? ''} onChange={(v) => onTriggerTypeChange(v as TriggerType)}>
          <option value="" disabled>
            Select a trigger type...
          </option>
          <option value="chefs-form">CHEFS Form</option>
          <option value="button">Button</option>
        </Select>
      </div>
      {triggerType === 'chefs-form' && (
        <ChefsFormFields
          value={chefsForm}
          onChange={onChefsFormChange}
          onSave={onSave}
          onCancel={onCancel}
          isSaving={isSaving}
        />
      )}
      {triggerType === 'button' && (
        <ButtonTriggerFields
          value={buttonForm}
          onChange={onButtonFormChange}
          onSave={onSave}
          onCancel={onCancel}
          isSaving={isSaving}
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
