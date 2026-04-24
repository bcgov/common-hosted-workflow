import { NextResponse } from 'next/server';
import { getPlayground, getPlaygroundForms } from './playground-db';
import type { PlaygroundDetail, FormEntry } from '@/types/playground';

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

// ── Shared route helpers ──

/**
 * Build a full PlaygroundDetail (with forms) from the database.
 *
 * Returns `null` when the playground does not exist.
 * Safely handles malformed `allowed_actors` JSON by falling back to an empty array.
 */
export function getPlaygroundDetail(name: string): PlaygroundDetail | null {
  const playground = getPlayground(name);
  if (!playground) return null;

  const formRecords = getPlaygroundForms(name);

  const forms: FormEntry[] = formRecords.map((f) => {
    let allowedActors: string[] = [];
    try {
      allowedActors = JSON.parse(f.allowed_actors) as string[];
    } catch {
      allowedActors = [];
    }
    return {
      formId: f.form_id,
      formName: f.form_name,
      apiKey: f.api_key,
      allowedActors,
      callbackWebhookUrl: f.callback_webhook_url,
    };
  });

  return {
    name: playground.name,
    owner: playground.owner,
    n8nTarget: playground.n8n_target,
    xN8nApiKey: playground.x_n8n_api_key,
    tenantId: playground.x_tenant_id,
    chefsBaseUrl: playground.chefs_base_url,
    forms,
    createdAt: playground.created_at,
    updatedAt: playground.updated_at,
  };
}

/**
 * Read the `x-playground-id` header and resolve the playground config.
 *
 * Returns `{ ok: true, playgroundName, config }` when the header is present
 * and the playground exists, or `{ ok: true, config: undefined }` when the
 * header is absent (no playground scoping requested).
 *
 * Returns `{ ok: false, response }` with a 404 NextResponse when the header
 * is present but the playground cannot be found.
 */
export function requirePlaygroundConfigFromHeader(
  request: Request,
):
  | { ok: true; playgroundName: string | null; config: ResolvedConfig | undefined }
  | { ok: false; response: NextResponse } {
  const playgroundName = request.headers.get('x-playground-id');

  if (playgroundName === null) {
    return { ok: true, playgroundName: null, config: undefined };
  }

  const resolved = resolvePlaygroundConfig(playgroundName);
  if (!resolved) {
    return { ok: false, response: NextResponse.json({ error: 'Playground not found' }, { status: 404 }) };
  }

  return { ok: true, playgroundName, config: resolved };
}
