import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ButtonTriggerPayload, TriggerTargetStatus } from '../../../services/backend/trigger-types';
import { NO_AUTOFILL } from './no-autofill';
import { TriggerTargetSection } from './trigger-target-section';
import { pruneInputValues } from './workflow-input-utils';
import {
  AllowedActorsField,
  AllowedActorsTypeField,
  TriggerFormActions,
  allowedActorsPlaceholder,
} from './trigger-shared';

export const DEFAULT_BUTTON: ButtonTriggerPayload = {
  type: 'button',
  targetKind: 'n8n-node',
  targetWorkflowId: '',
  targetNodeId: '',
  inputValues: {},
  buttonText: '',
  allowedActors: '',
  allowedActorsType: '',
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

  const hasTarget = Boolean(value.targetWorkflowId?.trim() && value.targetNodeId?.trim());
  const isValid = value.buttonText.trim() && hasTarget && value.allowedActorsType !== '';

  return (
    <div className="space-y-5">
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
      <TriggerTargetSection
        idPrefix="btn"
        tenantId={tenantId}
        source="button"
        workflowId={value.targetWorkflowId ?? ''}
        nodeId={value.targetNodeId ?? ''}
        inputValues={value.inputValues}
        savedStatus={savedStatus}
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
          placeholder={allowedActorsPlaceholder(value.allowedActorsType)}
          disabled={actorsLocked || value.allowedActorsType === 'all'}
        />
      </div>
      <TriggerFormActions onSave={onSave} onCancel={onCancel} isSaving={isSaving} isValid={!!isValid} />
    </div>
  );
}
