import type { TriggerCallbackResponse } from '../../../services/backend/trigger-types';
import { StatusPending, StatusSuccess, StatusError } from '../../shared/status-views';

export type ButtonCallbackStatus = 'idle' | 'pending' | 'success' | 'error';

interface TriggerButtonResultProps {
  status: ButtonCallbackStatus;
  error: Error | null;
  /** Backend response; present for n8n-node targets (execution id, and the last node's output for `lastNode`). */
  response?: TriggerCallbackResponse | null;
}

/** Shown in the detail pane after a button trigger is fired from the list. */
export function TriggerButtonResult({ status, error, response = null }: Readonly<TriggerButtonResultProps>) {
  if (status === 'pending') return <StatusPending label="Triggering workflow…" />;

  if (status === 'success') {
    const hasResult = response?.result !== undefined;
    return (
      <div className="space-y-4">
        <StatusSuccess
          title="Workflow Triggered"
          message={
            response?.executionId
              ? `Your workflow has been started (execution ${response.executionId}).`
              : 'Your workflow has been triggered successfully.'
          }
        />
        {hasResult && (
          <pre className="max-h-72 overflow-auto rounded-lg border border-border-strong bg-surface-subtle p-3 text-xs">
            {JSON.stringify(response?.result, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <StatusError
        title="Trigger Failed"
        error={error}
        fallback="Unable to trigger the workflow. Please try again or contact your administrator."
      />
    );
  }

  return null;
}
