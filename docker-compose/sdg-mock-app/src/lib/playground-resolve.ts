import { getPlayground, getPlaygroundForms } from './playground-db';

// ── Resolved interfaces (camelCase, ready for proxy consumption) ──

export interface ResolvedConfig {
  n8nTarget: string;
  apiKey: string;
  tenantId: string;
  chefsBaseUrl: string;
}

export interface ResolvedFormEntry {
  formId: string;
  formName: string;
  apiKey: string;
  allowedActors: string[];
  callbackWebhookUrl: string;
}

// ── Resolver functions ──

/**
 * Resolve a playground's WIL/CHEFS configuration from the database.
 *
 * Returns `null` when `playgroundName` is null or the playground is
 * not found in the database (the caller should return HTTP 404).
 */
export function resolvePlaygroundConfig(playgroundName: string | null): ResolvedConfig | null {
  if (playgroundName === null) {
    return null;
  }

  const record = getPlayground(playgroundName);
  if (!record) {
    return null;
  }

  return {
    n8nTarget: record.n8n_target,
    apiKey: record.x_n8n_api_key,
    tenantId: record.x_tenant_id,
    chefsBaseUrl: record.chefs_base_url,
  };
}

/**
 * Resolve a playground's CHEFS form entries from the database.
 *
 * Returns `null` when `playgroundName` is null or the playground is
 * not found in the database (the caller should return HTTP 404).
 */
export function resolvePlaygroundForms(playgroundName: string | null): ResolvedFormEntry[] | null {
  if (playgroundName === null) {
    return null;
  }

  const record = getPlayground(playgroundName);
  if (!record) {
    return null;
  }

  const formRecords = getPlaygroundForms(playgroundName);

  return formRecords.map((f) => ({
    formId: f.form_id,
    formName: f.form_name,
    apiKey: f.api_key,
    allowedActors: JSON.parse(f.allowed_actors) as string[],
    callbackWebhookUrl: f.callback_webhook_url,
  }));
}
