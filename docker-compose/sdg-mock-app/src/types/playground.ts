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
  buttonTriggers: ButtonTrigger[];
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

/** A button trigger that fires a webhook when clicked. */
export interface ButtonTrigger {
  id?: number;
  buttonText: string;
  method: 'GET' | 'POST';
  webhookUrl: string;
  postBody: string;
  includeActorId: boolean;
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
  buttonTriggers?: ButtonTrigger[];
}

/** Request body for updating a playground. */
export interface UpdatePlaygroundRequest {
  n8nTarget?: string;
  xN8nApiKey?: string;
  tenantId?: string;
  chefsBaseUrl?: string;
  forms?: FormEntry[];
  buttonTriggers?: ButtonTrigger[];
}

/** Exported playground configuration (for import/export). */
export interface PlaygroundExport {
  n8nTarget: string;
  xN8nApiKey: string;
  tenantId: string;
  chefsBaseUrl: string;
  forms: FormEntry[];
  buttonTriggers?: ButtonTrigger[];
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
