import { IconBolt, IconInfoCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { extractErrorMessage } from '../../shared/error-utils';
import type {
  TriggerTargetKind,
  TriggerTargetStatus,
  TriggerType,
  WilInputField,
  WilTriggerTarget,
} from '../../../services/backend/trigger-types';
import { Select } from './trigger-shared';
import { useTriggerTargets } from './use-trigger-targets';
import { WorkflowInputFields } from './workflow-input-fields';

export const targetOptionValue = (workflowId: string, nodeId: string) => `${workflowId}/${nodeId}`;

export const targetOptionLabel = (target: WilTriggerTarget) =>
  target.label === target.workflowName ? target.workflowName : `${target.label} — ${target.workflowName}`;

const STATUS_MESSAGES: Record<Exclude<TriggerTargetStatus, 'live'>, string> = {
  unpublished: 'The saved workflow is no longer published. Publish it again or choose another workflow.',
  'missing-node': 'The WIL Trigger node was removed from the saved workflow. Add it back or choose another workflow.',
};

interface TriggerTargetSectionProps {
  idPrefix: string;
  tenantId: string;
  source: TriggerType;
  kind: TriggerTargetKind;
  workflowId: string;
  nodeId: string;
  /** Typed input values; only edited for button triggers. */
  inputValues?: Record<string, unknown>;
  /** Live status of the saved target (edit mode). */
  savedStatus?: TriggerTargetStatus | null;
  onKindChange: (kind: TriggerTargetKind) => void;
  /** One call per selection (with the node's input schema) so callers can update everything in a single state change. */
  onTargetChange: (workflowId: string, nodeId: string, inputSchema: WilInputField[]) => void;
  onInputValuesChange?: (values: Record<string, unknown>) => void;
  /** Legacy webhook URL fields, rendered when kind is 'url'. */
  urlFields: ReactNode;
}

/**
 * Chooses what a trigger runs: a published workflow with a WIL Trigger node (internal, authenticated)
 * or, as an advanced fallback, a legacy webhook URL.
 */
export function TriggerTargetSection({
  idPrefix,
  tenantId,
  source,
  kind,
  workflowId,
  nodeId,
  inputValues = {},
  savedStatus,
  onKindChange,
  onTargetChange,
  onInputValuesChange,
  urlFields,
}: Readonly<TriggerTargetSectionProps>) {
  const targetsQuery = useTriggerTargets(tenantId, source);
  const targets = targetsQuery.data?.data ?? [];
  const featureOff = targetsQuery.data?.enabled === false;
  const effectiveKind: TriggerTargetKind = featureOff ? 'url' : kind;

  const selectedValue = workflowId && nodeId ? targetOptionValue(workflowId, nodeId) : '';
  const selected = targets.find((target) => targetOptionValue(target.workflowId, target.nodeId) === selectedValue);
  const savedMissing = Boolean(selectedValue) && !selected && !targetsQuery.isPending;
  const statusMessage = savedStatus && savedStatus !== 'live' ? STATUS_MESSAGES[savedStatus] : null;

  function selectTarget(value: string) {
    const target = targets.find((t) => targetOptionValue(t.workflowId, t.nodeId) === value);
    if (!target) return;
    onTargetChange(target.workflowId, target.nodeId, target.inputSchema);
  }

  return (
    <div className="space-y-4">
      {effectiveKind === 'n8n-node' ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-target`}>
              Workflow <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <IconBolt size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <Select
                id={`${idPrefix}-target`}
                value={selectedValue}
                onChange={selectTarget}
                disabled={targetsQuery.isPending}
              >
                <option value="">{targetsQuery.isPending ? 'Loading workflows...' : 'Select a workflow...'}</option>
                {savedMissing && <option value={selectedValue}>Saved workflow (unavailable)</option>}
                {targets.map((target) => (
                  <option
                    key={targetOptionValue(target.workflowId, target.nodeId)}
                    value={targetOptionValue(target.workflowId, target.nodeId)}
                  >
                    {targetOptionLabel(target)}
                  </option>
                ))}
              </Select>
            </div>
            {targetsQuery.isError && (
              <p className="text-sm text-red-600">
                {extractErrorMessage(targetsQuery.error, 'Could not load workflows')}
              </p>
            )}
            {!targetsQuery.isPending && !targetsQuery.isError && targets.length === 0 && !savedMissing && (
              <p className="text-sm text-muted-foreground">
                No published workflows with a WIL Trigger node accept this trigger type in this project. Add a{' '}
                <strong>WIL Trigger</strong> node to a workflow and publish it.
              </p>
            )}
            {selected?.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}
            {(statusMessage || savedMissing) && (
              <p className="text-sm text-[#a2312d]">{statusMessage ?? STATUS_MESSAGES.unpublished}</p>
            )}
          </div>
          {selected && source === 'button' && onInputValuesChange && (
            <WorkflowInputFields
              key={selectedValue}
              idPrefix={idPrefix}
              schema={selected.inputSchema}
              values={inputValues}
              onChange={onInputValuesChange}
            />
          )}
          <div className="flex items-start gap-2.5 rounded-lg border border-[#91c4fa] bg-[#f1f8fe] px-3.5 py-3">
            <IconInfoCircle size={18} className="mt-0.5 shrink-0 text-[#255a90]" aria-hidden="true" />
            <p className="text-[13px] text-[#474543]">
              The workflow runs inside n8n with the workflow owner&apos;s credentials, not the triggering person&apos;s.
              The actor&apos;s email, roles and groups are passed to the WIL Trigger node as data. No webhook URL is
              used.
            </p>
          </div>
        </>
      ) : (
        urlFields
      )}
      {!featureOff && (
        <button
          type="button"
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => onKindChange(effectiveKind === 'n8n-node' ? 'url' : 'n8n-node')}
        >
          {effectiveKind === 'n8n-node' ? 'Advanced: call a webhook URL instead' : 'Use a WIL Trigger node instead'}
        </button>
      )}
    </div>
  );
}
