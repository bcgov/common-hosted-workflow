/**
 * Server-side helper for proxying requests to the Workflow Interaction Layer API.
 * Reads credentials from environment variables so they never reach the browser.
 */

const getEnv = () => {
  const n8nTarget = (process.env.N8N_TARGET || 'http://localhost:5678').replace(/\/+$/, '');
  const apiKey = process.env.X_N8N_API_KEY || '';
  const tenantId = process.env.X_TENANT_ID || '';
  return { n8nTarget, apiKey, tenantId };
};

function logRequest(method: string, url: string, status?: number) {
  const { apiKey, tenantId, n8nTarget } = getEnv();
  const maskedKey = apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : '(empty)';
  console.log(
    `[wil-proxy] ${method} ${url} → status=${status ?? '?'} | target=${n8nTarget} apiKey=${maskedKey} tenantId=${tenantId || '(empty)'}`,
  );
}

export function wilHeaders(): Record<string, string> {
  const { apiKey, tenantId } = getEnv();
  return {
    'X-N8N-API-KEY': apiKey,
    'X-TENANT-ID': tenantId,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export function wilBaseUrl(): string {
  const { n8nTarget } = getEnv();
  return `${n8nTarget}/rest/custom/v1`;
}

/** Forward a GET request to the WIL API and return the raw Response. */
export async function wilGet(path: string, searchParams?: URLSearchParams): Promise<Response> {
  const qs = searchParams?.toString();
  const url = `${wilBaseUrl()}${path}${qs ? '?' + qs : ''}`;
  const resp = await fetch(url, { headers: wilHeaders(), cache: 'no-store' });
  logRequest('GET', url, resp.status);
  if (!resp.ok) {
    const body = await resp.clone().text();
    console.error(`[wil-proxy] GET ${url} error body:`, body);
  }
  return resp;
}

/** Forward a PATCH request to the WIL API. */
export async function wilPatch(path: string, body: unknown): Promise<Response> {
  const url = `${wilBaseUrl()}${path}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: wilHeaders(),
    body: JSON.stringify(body),
  });
  logRequest('PATCH', url, resp.status);
  if (!resp.ok) {
    const errBody = await resp.clone().text();
    console.error(`[wil-proxy] PATCH ${url} error body:`, errBody);
  }
  return resp;
}

/** Forward an arbitrary request to a callback URL with WIL credentials. */
export async function wilCallback(callbackUrl: string, method: string, body: unknown): Promise<Response> {
  // Rewrite public-facing n8n URLs to the internal Docker hostname.
  // The browser sends localhost:5678 but this container must reach n8n via the Docker network.
  const { n8nTarget } = getEnv();
  const rewritten = callbackUrl.replace(/^https?:\/\/localhost:5678/, n8nTarget);
  const resp = await fetch(rewritten, {
    method,
    headers: wilHeaders(),
    body: JSON.stringify(body),
  });
  logRequest(method, rewritten, resp.status);
  if (!resp.ok) {
    const errBody = await resp.clone().text();
    console.error(`[wil-proxy] ${method} ${rewritten} error body:`, errBody);
  }
  return resp;
}
