import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ButtonTriggerPayload } from '../../../services/backend/trigger-types';
import {
  ActorIdBanner,
  AllowedActorsField,
  AllowedActorsTypeField,
  PostBodyField,
  TriggerFormActions,
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
      <PostBodyField
        id="btn-post-body"
        value={value.postBody}
        onChange={(v) => set('postBody', v)}
        method={value.triggerMethod}
      />
      <div className="grid grid-cols-2 gap-4">
        <AllowedActorsTypeField
          id="btn-actors-type"
          value={value.allowedActorsType}
          onChange={(v) => {
            if (v === 'all') {
              onChange({ ...value, allowedActorsType: 'all', allowedActors: '*' });
            } else {
              onChange({
                ...value,
                allowedActorsType: v,
                allowedActors: value.allowedActorsType === 'all' ? '' : value.allowedActors,
              });
            }
          }}
          disabled={actorsLocked}
        />
        <AllowedActorsField
          id="btn-allowed-actors"
          value={value.allowedActors}
          onChange={(v) => set('allowedActors', v)}
          placeholder="e.g. * or specific role/user"
          disabled={actorsLocked || value.allowedActorsType === 'all'}
        />
      </div>
      <ActorIdBanner method={value.triggerMethod} />
      <TriggerFormActions onSave={onSave} onCancel={onCancel} isSaving={isSaving} isValid={!!isValid} />
    </div>
  );
}
