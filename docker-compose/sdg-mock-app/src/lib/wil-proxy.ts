/**
 * Server-side helper for proxying requests to the Workflow Interaction Layer API.
 *
 * All callers must provide a ResolvedConfig with the playground's credentials.
 * Environment-variable fallback has been removed — credentials come exclusively
 * from the playground database.
 */

import type { ResolvedConfig } from './playground-resolve';
import { trimTrailingSlashes } from './url';

function getEffective(config: ResolvedConfig) {
  return {
    n8nTarget: trimTrailingSlashes(config.n8nTarget),
    apiKey: config.apiKey,
    tenantId: config.tenantId,
  };
}

function logRequest(method: string, url: string, status?: number, config?: ResolvedConfig) {
  if (!config) return;
  const { apiKey, tenantId, n8nTarget } = getEffective(config);
  const maskedKey = apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : '(empty)';
  console.log(
    `[wil-proxy] ${method} ${url} → status=${status ?? '?'} | target=${n8nTarget} apiKey=${maskedKey} tenantId=${tenantId || '(empty)'}`,
  );
}

export function wilHeaders(config: ResolvedConfig): Record<string, string> {
  const { apiKey, tenantId } = getEffective(config);
  return {
    'X-N8N-API-KEY': apiKey,
    'X-TENANT-ID': tenantId,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export function wilBaseUrl(config: ResolvedConfig): string {
  const { n8nTarget } = getEffective(config);
  return `${n8nTarget}/rest/custom/v1`;
}

/** Forward a GET request to the WIL API and return the raw Response. */
export async function wilGet(path: string, searchParams?: URLSearchParams, config?: ResolvedConfig): Promise<Response> {
  if (!config) throw new Error('[wil-proxy] ResolvedConfig is required');
  const qs = searchParams?.toString();
  const url = `${wilBaseUrl(config)}${path}${qs ? '?' + qs : ''}`;
  const resp = await fetch(url, { headers: wilHeaders(config), cache: 'no-store' });
  logRequest('GET', url, resp.status, config);
  if (!resp.ok) {
    const body = await resp.clone().text();
    console.error(`[wil-proxy] GET ${url} error body:`, body);
  }
  return resp;
}

/** Forward a PATCH request to the WIL API. */
export async function wilPatch(path: string, body: unknown, config?: ResolvedConfig): Promise<Response> {
  if (!config) throw new Error('[wil-proxy] ResolvedConfig is required');
  const url = `${wilBaseUrl(config)}${path}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: wilHeaders(config),
    body: JSON.stringify(body),
  });
  logRequest('PATCH', url, resp.status, config);
  if (!resp.ok) {
    const errBody = await resp.clone().text();
    console.error(`[wil-proxy] PATCH ${url} error body:`, errBody);
  }
  return resp;
}

/** Fetch a single action by ID from the WIL API (server-side only). */
export async function wilGetAction(actionId: string, config?: ResolvedConfig): Promise<Response> {
  if (!config) throw new Error('[wil-proxy] ResolvedConfig is required');
  const url = `${wilBaseUrl(config)}/actions/${encodeURIComponent(actionId)}`;
  const resp = await fetch(url, { headers: wilHeaders(config), cache: 'no-store' });
  logRequest('GET', url, resp.status, config);
  if (!resp.ok) {
    const body = await resp.clone().text();
    console.error(`[wil-proxy] GET ${url} error body:`, body);
  }
  return resp;
}

/** Forward an arbitrary request to a callback URL with WIL credentials. */
export async function wilCallback(
  callbackUrl: string,
  method: string,
  body: unknown,
  config?: ResolvedConfig,
): Promise<Response> {
  if (!config) throw new Error('[wil-proxy] ResolvedConfig is required');
  const { n8nTarget } = getEffective(config);
  const rewritten = callbackUrl.replace(/^https?:\/\/localhost:5678/, n8nTarget);
  const resp = await fetch(rewritten, {
    method,
    headers: wilHeaders(config),
    body: JSON.stringify(body),
  });
  logRequest(method, rewritten, resp.status, config);
  if (!resp.ok) {
    const errBody = await resp.clone().text();
    console.error(`[wil-proxy] ${method} ${rewritten} error body:`, errBody);
  }
  return resp;
}
