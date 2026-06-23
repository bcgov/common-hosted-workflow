import { IconDeviceFloppy, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ChefsFormTriggerPayload } from '../../../services/backend/triggers';
import {
  ActorIdBanner,
  AllowedActorsField,
  AllowedActorsTypeField,
  TriggerMethodField,
  TriggerUrlField,
} from './trigger-shared';

export const DEFAULT_CHEFS_FORM: ChefsFormTriggerPayload = {
  type: 'chefs-form',
  formId: '',
  formName: '',
  apiKey: '',
  allowedActors: '*',
  allowedActorsType: '',
  callbackWebhookUrl: '',
  triggerMethod: 'POST',
  includeActorId: true,
};

interface ChefsFormFieldsProps {
  value: ChefsFormTriggerPayload;
  onChange: (v: ChefsFormTriggerPayload) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function ChefsFormFields({ value, onChange, onSave, onCancel, isSaving }: Readonly<ChefsFormFieldsProps>) {
  function set<K extends keyof ChefsFormTriggerPayload>(key: K, val: ChefsFormTriggerPayload[K]) {
    onChange({ ...value, [key]: val });
  }

  const isValid =
    value.formId.trim() &&
    value.formName.trim() &&
    value.apiKey.trim() &&
    value.callbackWebhookUrl.trim() &&
    value.allowedActorsType !== '';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="chefs-form-id">
            Form ID <span className="text-red-500">*</span>
          </Label>
          <Input
            id="chefs-form-id"
            placeholder="e.g. abc123-def456"
            value={value.formId}
            onChange={(e) => set('formId', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chefs-form-name">
            Form Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="chefs-form-name"
            placeholder="e.g. My CHEFS Form"
            value={value.formName}
            onChange={(e) => set('formName', e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="chefs-api-key">
            API Key <span className="text-red-500">*</span>
          </Label>
          <Input
            id="chefs-api-key"
            placeholder="Form API key"
            value={value.apiKey}
            onChange={(e) => set('apiKey', e.target.value)}
          />
        </div>
        <TriggerMethodField
          id="chefs-trigger-method"
          value={value.triggerMethod}
          onChange={(v) => set('triggerMethod', v)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <AllowedActorsTypeField
          id="chefs-actors-type"
          value={value.allowedActorsType}
          onChange={(v) => set('allowedActorsType', v)}
        />
        <AllowedActorsField
          id="chefs-allowed-actors"
          value={value.allowedActors}
          onChange={(v) => set('allowedActors', v)}
          required
        />
      </div>
      <TriggerUrlField
        id="chefs-callback-url"
        label="Callback Webhook URL"
        value={value.callbackWebhookUrl}
        onChange={(v) => set('callbackWebhookUrl', v)}
      />
      <ActorIdBanner method={value.triggerMethod} />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          <IconX size={16} aria-hidden="true" />
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={!isValid || isSaving}>
          <IconDeviceFloppy size={16} aria-hidden="true" />
          {isSaving ? 'Saving...' : 'Save Trigger'}
        </Button>
      </div>
    </div>
  );
}
