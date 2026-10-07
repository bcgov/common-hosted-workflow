import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ButtonTriggerPayload } from '../../../services/backend/trigger-types';
import { NO_AUTOFILL } from './no-autofill';
import { TriggerTargetSection } from './trigger-target-section';
import { pruneInputValues } from './workflow-input-utils';
import type { TriggerTargetStatus } from '../../../services/backend/trigger-types';
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
  targetKind: 'n8n-node',
  targetWorkflowId: '',
  targetNodeId: '',
  inputValues: {},
  buttonText: '',
  webhookUrl: '',
  postBody: '',
  allowedActors: '',
  allowedActorsType: '',
  triggerMethod: 'POST',
  includeActorId: true,
};

interface ButtonTriggerFieldsProps {
  tenantId: string;
  /** Live status of the saved target (edit mode only). */
  savedStatus?: TriggerTargetStatus | null;
  value: ButtonTriggerPayload;
  onChange: (v: ButtonTriggerPayload) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  /** When true, Allowed Actors Type and Allowed Actors fields are read-only (personal project). */
  actorsLocked?: boolean;
}

export function ButtonTriggerFields({
  tenantId,
  savedStatus,
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

  const isNodeTarget = value.targetKind === 'n8n-node';
  const hasTarget = isNodeTarget
    ? Boolean(value.targetWorkflowId?.trim() && value.targetNodeId?.trim())
    : Boolean(value.webhookUrl.trim());
  const isValid = value.buttonText.trim() && hasTarget && value.allowedActorsType !== '';

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
            {...NO_AUTOFILL}
          />
        </div>
        {!isNodeTarget && (
          <TriggerMethodField
            id="btn-trigger-method"
            value={value.triggerMethod}
            onChange={(v) => set('triggerMethod', v)}
          />
        )}
      </div>
      <TriggerTargetSection
        idPrefix="btn"
        tenantId={tenantId}
        source="button"
        kind={value.targetKind ?? 'url'}
        workflowId={value.targetWorkflowId ?? ''}
        nodeId={value.targetNodeId ?? ''}
        inputValues={value.inputValues}
        savedStatus={savedStatus}
        onKindChange={(targetKind) => set('targetKind', targetKind)}
        onTargetChange={(targetWorkflowId, targetNodeId, schema) =>
          // Single update: values for fields the new node doesn't declare must not leak into the save.
          onChange({
            ...value,
            targetWorkflowId,
            targetNodeId,
            inputValues: pruneInputValues(schema, value.inputValues ?? {}),
          })
        }
        onInputValuesChange={(inputValues) => set('inputValues', inputValues)}
        urlFields={
          <>
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
          </>
        }
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
      {!isNodeTarget && <ActorIdBanner method={value.triggerMethod} />}
      <TriggerFormActions onSave={onSave} onCancel={onCancel} isSaving={isSaving} isValid={!!isValid} />
    </div>
  );
}
