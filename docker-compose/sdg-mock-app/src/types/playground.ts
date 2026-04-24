/** Non-sensitive playground summary for the landing page list. */
export interface PlaygroundSummary {
  name: string;
  owner: string;
  n8nTarget: string;
  chefsBaseUrl: string;
  tenantId: string;
  formCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Full playground detail including sensitive fields (Configuration Page only). */
export interface PlaygroundDetail {
  name: string;
  owner: string;
  n8nTarget: string;
  xN8nApiKey: string;
  tenantId: string;
  chefsBaseUrl: string;
  forms: FormEntry[];
  createdAt: string;
  updatedAt: string;
}

/** A single CHEFS form entry within a playground. */
export interface FormEntry {
  formId: string;
  formName: string;
  apiKey: string;
  allowedActors: string[];
  callbackWebhookUrl: string;
}

/** Request body for creating a playground. */
export interface CreatePlaygroundRequest {
  name: string;
  owner: string;
  n8nTarget?: string;
  xN8nApiKey?: string;
  tenantId?: string;
  chefsBaseUrl?: string;
  forms?: FormEntry[];
}

/** Request body for updating a playground. */
export interface UpdatePlaygroundRequest {
  n8nTarget?: string;
  xN8nApiKey?: string;
  tenantId?: string;
  chefsBaseUrl?: string;
  forms?: FormEntry[];
}

/** Exported playground configuration (for import/export). */
export interface PlaygroundExport {
  n8nTarget: string;
  xN8nApiKey: string;
  tenantId: string;
  chefsBaseUrl: string;
  forms: FormEntry[];
}

/** Connection test result. */
export interface ConnectionTestResult {
  success: boolean;
  status?: number;
  message: string;
  responseTimeMs?: number;
}

/** Validation result for names and import payloads. */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}
