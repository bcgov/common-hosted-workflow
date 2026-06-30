import { StatusPending, StatusSuccess, StatusError } from '../../shared/status-views';

export type ButtonCallbackStatus = 'idle' | 'pending' | 'success' | 'error';

interface TriggerButtonResultProps {
  status: ButtonCallbackStatus;
  error: Error | null;
}

/** Shown in the detail pane after a button trigger is fired from the list. */
export function TriggerButtonResult({ status, error }: Readonly<TriggerButtonResultProps>) {
  if (status === 'pending') return <StatusPending label="Triggering workflow…" />;

  if (status === 'success') {
    return <StatusSuccess title="Workflow Triggered" message="Your workflow has been triggered successfully." />;
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
