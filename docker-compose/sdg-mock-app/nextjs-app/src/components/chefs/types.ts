export interface ChefsFormViewerProps {
  formId: string;
  baseUrl?: string;
  authToken?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  submissionId?: string;
  readOnly?: boolean;
  language?: string;
  isolateStyles?: boolean;
  onFormReady?: (detail: { formio: unknown }) => void;
  onSubmissionComplete?: (detail: unknown) => void;
  onSubmissionError?: (detail: unknown) => void;
}

export type ScriptStatus = 'idle' | 'loading' | 'ready' | 'error';
