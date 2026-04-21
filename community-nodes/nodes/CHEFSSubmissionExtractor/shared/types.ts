export interface ChefsFormCredentials {
  baseUrl: string;
  formId: string;
  apiKey: string;
}

export interface FieldMapping {
  /** The key name in the output object */
  outputKey: string;
  /** Dot-notation path into the submission data, e.g. "company.headquarters.address.city" */
  sourcePath: string;
}

export interface FieldResolution {
  /** Whether the path exists in the data structure (key is present) */
  exists: boolean;
  /** The resolved value — undefined if path doesn't exist, may be null/empty if it does */
  value: unknown;
}

export interface ValidationResult {
  valid: boolean;
  missingPaths: Array<{ outputKey: string; sourcePath: string }>;
}

export interface ChefsSubmissionInner {
  id: string;
  formVersionId: string;
  confirmationId: string;
  draft: boolean;
  deleted: boolean;
  submission: {
    data: Record<string, unknown>;
    state: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
  version?: Record<string, unknown>;
  form?: Record<string, unknown>;
}

/** The actual CHEFS API response wraps everything inside a top-level `submission` key */
export interface ChefsSubmissionResponse {
  submission: ChefsSubmissionInner;
}
