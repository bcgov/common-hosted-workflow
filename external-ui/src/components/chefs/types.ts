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
  onFormReady?: (detail: { formio: unknown }) => void;
  onSubmissionComplete?: (detail: unknown) => void;
  onSubmissionError?: (detail: unknown) => void;
  /** Called before submission. Return false or reject to block. */
  onBeforeSubmit?: () => Promise<boolean>;
}

export type ScriptStatus = 'idle' | 'loading' | 'ready' | 'error';
