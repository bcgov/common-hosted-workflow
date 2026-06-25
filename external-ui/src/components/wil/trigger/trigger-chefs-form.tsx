import { useState } from 'react';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ChefsFormTriggerPayload } from '../../../services/backend/triggers';
import {
  ActorIdBanner,
  AllowedActorsField,
  AllowedActorsTypeField,
  TriggerFormActions,
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
  /** When true, Allowed Actors Type and Allowed Actors fields are read-only (personal project). */
  actorsLocked?: boolean;
}

export function ChefsFormFields({
  value,
  onChange,
  onSave,
  onCancel,
  isSaving,
  actorsLocked = false,
}: Readonly<ChefsFormFieldsProps>) {
  const [showApiKey, setShowApiKey] = useState(false);

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
          <div className="relative">
            <Input
              id="chefs-api-key"
              type={showApiKey ? 'text' : 'password'}
              placeholder="Form API key"
              value={value.apiKey}
              onChange={(e) => set('apiKey', e.target.value)}
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowApiKey(!showApiKey)}
              aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--bc-muted)] hover:text-[var(--bc-text)]"
            >
              {showApiKey ? <IconEyeOff size={16} aria-hidden="true" /> : <IconEye size={16} aria-hidden="true" />}
            </Button>
          </div>
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
          disabled={actorsLocked}
        />
        <AllowedActorsField
          id="chefs-allowed-actors"
          value={value.allowedActors}
          onChange={(v) => set('allowedActors', v)}
          required
          disabled={actorsLocked}
        />
      </div>
      <TriggerUrlField
        id="chefs-callback-url"
        label="Callback Webhook URL"
        value={value.callbackWebhookUrl}
        onChange={(v) => set('callbackWebhookUrl', v)}
      />
      <ActorIdBanner method={value.triggerMethod} />
      <TriggerFormActions onSave={onSave} onCancel={onCancel} isSaving={isSaving} isValid={!!isValid} />
    </div>
  );
}
