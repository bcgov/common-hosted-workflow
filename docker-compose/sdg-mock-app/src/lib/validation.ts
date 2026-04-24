import type { ValidationResult } from '@/types/playground';

// ── Regex patterns ──

const PLAYGROUND_NAME_RE = /^[a-z0-9_-]{1,64}$/;
const TESTER_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// ── Name validators ──

/**
 * Validate a playground name: lowercase alphanumeric, hyphens, underscores, 1–64 chars.
 */
export function validatePlaygroundName(name: string): ValidationResult {
  if (name.length === 0) {
    return { valid: false, error: 'Playground name must not be empty' };
  }
  if (name.length > 64) {
    return {
      valid: false,
      error: 'Playground name must be at most 64 characters',
    };
  }
  if (!PLAYGROUND_NAME_RE.test(name)) {
    return {
      valid: false,
      error: 'Playground name must contain only lowercase alphanumeric characters, hyphens, and underscores',
    };
  }
  return { valid: true };
}

/**
 * Validate a tester name: alphanumeric, hyphens, underscores, 1–64 chars.
 */
export function validateTesterName(name: string): ValidationResult {
  if (name.length === 0) {
    return { valid: false, error: 'Tester name must not be empty' };
  }
  if (name.length > 64) {
    return {
      valid: false,
      error: 'Tester name must be at most 64 characters',
    };
  }
  if (!TESTER_NAME_RE.test(name)) {
    return {
      valid: false,
      error: 'Tester name must contain only alphanumeric characters, hyphens, and underscores',
    };
  }
  return { valid: true };
}

// ── Import payload validator ──

/**
 * Validate an import payload object. Checks that all required fields are
 * present and have the correct types, including the `forms` array entries.
 */
export function validateImportPayload(data: unknown): ValidationResult {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'Import payload must be a JSON object' };
  }

  const obj = data as Record<string, unknown>;

  // Required top-level string fields
  const requiredStringFields = ['n8nTarget', 'xN8nApiKey', 'tenantId', 'chefsBaseUrl'] as const;
  for (const field of requiredStringFields) {
    if (!Object.hasOwn(obj, field)) {
      return { valid: false, error: `Missing required field: '${field}'` };
    }
    if (typeof obj[field] !== 'string') {
      return { valid: false, error: `Field '${field}' must be a string` };
    }
  }

  // Required forms array
  if (!Object.hasOwn(obj, 'forms')) {
    return { valid: false, error: "Missing required field: 'forms'" };
  }
  if (!Array.isArray(obj.forms)) {
    return { valid: false, error: "Field 'forms' must be an array" };
  }

  // Validate each form entry
  const forms = obj.forms as unknown[];
  for (let i = 0; i < forms.length; i++) {
    const result = validateFormEntry(forms[i], i);
    if (!result.valid) {
      return result;
    }
  }

  return { valid: true };
}

/**
 * Validate a single form entry inside an import payload.
 */
function validateFormEntry(entry: unknown, index: number): ValidationResult {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { valid: false, error: `forms[${index}] must be an object` };
  }

  const obj = entry as Record<string, unknown>;

  const requiredStringFields = ['formId', 'formName', 'apiKey', 'callbackWebhookUrl'] as const;
  for (const field of requiredStringFields) {
    if (!Object.hasOwn(obj, field)) {
      return { valid: false, error: `forms[${index}] is missing required field: '${field}'` };
    }
    if (typeof obj[field] !== 'string') {
      return { valid: false, error: `forms[${index}].${field} must be a string` };
    }
  }

  // allowedActors must be an array of strings
  if (!Object.hasOwn(obj, 'allowedActors')) {
    return { valid: false, error: `forms[${index}] is missing required field: 'allowedActors'` };
  }
  if (!Array.isArray(obj.allowedActors)) {
    return { valid: false, error: `forms[${index}].allowedActors must be an array` };
  }
  for (const actor of obj.allowedActors as unknown[]) {
    if (typeof actor !== 'string') {
      return { valid: false, error: `forms[${index}].allowedActors must contain only strings` };
    }
  }

  return { valid: true };
}
