export interface ChefsFormViewerProps {
  formId: string;
  authToken?: string;
  baseUrl?: string;
  prefillData?: Record<string, unknown>;
  readOnly?: boolean;
  language?: string;
  onFormReady?: (detail: { formio: unknown }) => void;
  onSubmissionComplete?: (detail: unknown) => void;
  onSubmissionError?: (detail: unknown) => void;
}

export type ScriptStatus = 'idle' | 'loading' | 'ready' | 'error';
