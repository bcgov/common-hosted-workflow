import { IconDeviceFloppy, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ButtonTriggerPayload } from '../../../services/backend/triggers';
import {
  ActorIdBanner,
  AllowedActorsField,
  AllowedActorsTypeField,
  TriggerMethodField,
  TriggerUrlField,
} from './trigger-shared';

export const DEFAULT_BUTTON: ButtonTriggerPayload = {
  type: 'button',
  buttonText: '',
  webhookUrl: '',
  postBody: '',
  allowedActors: '',
  allowedActorsType: '',
  triggerMethod: 'POST',
  includeActorId: true,
};

interface ButtonTriggerFieldsProps {
  value: ButtonTriggerPayload;
  onChange: (v: ButtonTriggerPayload) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  /** When true, Allowed Actors Type and Allowed Actors fields are read-only (personal project). */
  actorsLocked?: boolean;
}

export function ButtonTriggerFields({
  value,
  onChange,
  onSave,
  onCancel,
  isSaving,
  actorsLocked = false,
}: Readonly<ButtonTriggerFieldsProps>) {
  function set<K extends keyof ButtonTriggerPayload>(key: K, val: ButtonTriggerPayload[K]) {
    onChange({ ...value, [key]: val });
  }

  const isValid = value.buttonText.trim() && value.webhookUrl.trim() && value.allowedActorsType !== '';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="btn-text">
            Button Text <span className="text-red-500">*</span>
          </Label>
          <Input
            id="btn-text"
            placeholder="e.g. Submit Disability Application"
            value={value.buttonText}
            onChange={(e) => set('buttonText', e.target.value)}
          />
        </div>
        <TriggerMethodField
          id="btn-trigger-method"
          value={value.triggerMethod}
          onChange={(v) => set('triggerMethod', v)}
        />
      </div>
      <TriggerUrlField
        id="btn-webhook-url"
        label="Webhook URL"
        value={value.webhookUrl}
        onChange={(v) => set('webhookUrl', v)}
        placeholder="e.g. http://n8n:5678/webhook/my-trigger"
      />
      <div className="space-y-1.5">
        <Label htmlFor="btn-post-body">POST Body (optional JSON)</Label>
        <Textarea
          id="btn-post-body"
          placeholder={'e.g. {"time": "today"}'}
          value={value.postBody}
          onChange={(e) => set('postBody', e.target.value)}
          rows={3}
          className="font-mono text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <AllowedActorsTypeField
          id="btn-actors-type"
          value={value.allowedActorsType}
          onChange={(v) => set('allowedActorsType', v)}
          disabled={actorsLocked}
        />
        <AllowedActorsField
          id="btn-allowed-actors"
          value={value.allowedActors}
          onChange={(v) => set('allowedActors', v)}
          placeholder="e.g. * or specific role/user"
          disabled={actorsLocked}
        />
      </div>
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
