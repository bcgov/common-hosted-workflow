export interface HostSubmitDetail {
  data: Record<string, unknown>;
  submission: unknown;
  formId: string;
  formName: string;
  timestamp: string;
  isDraft: boolean;
}

export interface ChefsFormViewerProps {
  formId: string;
  authToken?: string;
  baseUrl?: string;
  submissionId?: string;
  prefillData?: Record<string, unknown>;
  token?: Record<string, unknown>;
  user?: Record<string, unknown>;
  headers?: Record<string, string>;
  readOnly?: boolean;
  language?: string;
  /** Controls how form submission is handled. Default is 'chefs' (normal CHEFS submission). */
  submitMode?: 'chefs' | 'host' | 'none';
  onFormReady?: (detail: { formio: unknown }) => void;
  onSubmissionComplete?: (detail: unknown) => void;
  onSubmissionError?: (detail: unknown) => void;
  /** Called before submission. Return false or reject to block. */
  onBeforeSubmit?: () => Promise<boolean>;
  /** Called when submit-mode is 'host' or 'none' after validation passes. */
  onHostSubmit?: (detail: HostSubmitDetail) => void;
}

export type ScriptStatus = 'idle' | 'loading' | 'ready' | 'error';
