import { IconLoader2 } from '@tabler/icons-react';
import { ChefsFormViewer } from './chefs-form-viewer';
import { StatusPending, StatusSuccess, StatusError, ErrorAlert } from '../shared/status-views';

export interface ChefsFormPanelInitData {
  formId: string;
  authToken: string;
  baseUrl: string;
  submissionId?: string;
  prefillData?: Record<string, unknown>;
  token: Record<string, unknown>;
  user: Record<string, unknown>;
  headers: Record<string, string>;
}

interface ChefsFormPanelProps {
  /** True while the form token / init data is being fetched. */
  initPending: boolean;
  /** Error thrown during init, if any. */
  initError: Error | null;
  /** Resolved init data once the fetch succeeds. */
  initData: ChefsFormPanelInitData | undefined;

  /** True while the submission callback is in flight. */
  submitPending: boolean;
  /** True once the submission callback has succeeded. */
  submitSuccess: boolean;
  /** Error thrown during submission, if any. */
  submitError: Error | null;

  /** Heading shown above the success message. */
  successTitle?: string;
  /** Message shown below the success heading. */
  successMessage?: string;
  /** Heading shown on the submission error alert. */
  errorTitle?: string;
  /** Fallback text used when extracting an error message from submitError. */
  submitErrorFallback?: string;

  onSubmissionComplete: (detail: unknown) => void;
}

/**
 * Shared CHEFS form container used by both the WIL action-handler flow
 * (ShowFormHandler) and the trigger detail pane (TriggerChefsPreview).
 *
 * Owns all the UI-state rendering (loading, error, success, submission overlay)
 * so neither consumer needs to duplicate it.
 */
export function ChefsFormPanel({
  initPending,
  initError,
  initData,
  submitPending,
  submitSuccess,
  submitError,
  successTitle = 'Form submitted successfully',
  successMessage = 'Your response has been recorded.',
  errorTitle = 'Submission Error',
  submitErrorFallback = 'Failed to submit form. Please try again.',
  onSubmissionComplete,
}: Readonly<ChefsFormPanelProps>) {
  if (initPending) return <StatusPending label="Loading form…" />;

  if (initError) {
    return <StatusError title="Error" error={initError} fallback="Failed to load form. Please try again." />;
  }

  if (submitSuccess) return <StatusSuccess title={successTitle} message={successMessage} />;

  if (!initData) return null;

  return (
    <div className="relative h-full overflow-auto p-4">
      {submitPending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70" aria-live="polite">
          <div className="flex items-center gap-2 text-sm text-[var(--bc-muted)]">
            <IconLoader2 size={20} className="animate-spin" aria-hidden="true" />
            <span>Submitting…</span>
          </div>
        </div>
      )}

      {submitError && (
        <div className="mb-4" aria-live="polite">
          <ErrorAlert title={errorTitle} error={submitError} fallback={submitErrorFallback} />
        </div>
      )}

      <ChefsFormViewer
        formId={initData.formId}
        authToken={initData.authToken}
        baseUrl={initData.baseUrl}
        submissionId={initData.submissionId}
        prefillData={initData.prefillData}
        token={initData.token}
        user={initData.user}
        headers={initData.headers}
        onSubmissionComplete={onSubmissionComplete}
      />
    </div>
  );
}
