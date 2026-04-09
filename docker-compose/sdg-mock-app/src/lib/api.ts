// ── Types ──

export interface Message {
  id: string;
  title: string;
  body: string;
  actorId: string;
  actorType: string;
  workflowInstanceId: string;
  workflowId: string;
  projectId?: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActionRequest {
  id: string;
  actionType: string;
  payload: Record<string, unknown>;
  callbackUrl: string;
  callbackMethod?: string;
  callbackPayloadSpec?: Record<string, unknown> | null;
  actorId: string;
  actorType: string;
  workflowInstanceId: string;
  workflowId: string;
  projectId?: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  checkIn?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppConfig {
  baseUrl: string;
  apiKey: string;
  tenantId: string;
  corsProxy: string;
}

export interface FormConfig {
  webhookUrl: string;
}

// ── Defaults ──

export const DEFAULT_CONFIG: AppConfig = {
  baseUrl: '',
  apiKey: '',
  tenantId: '',
  corsProxy: '',
};

export const DEFAULT_FORM_CONFIG: FormConfig = {
  webhookUrl: '',
};

// ── Persistence ──

const CONFIG_KEY = 'sdg_config';
const FORM_CONFIG_KEY = 'sdg_form_config';

export function loadConfig(): AppConfig {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(cfg: AppConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function loadFormConfig(): FormConfig {
  try {
    const saved = localStorage.getItem(FORM_CONFIG_KEY);
    if (saved) return { ...DEFAULT_FORM_CONFIG, ...JSON.parse(saved) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_FORM_CONFIG };
}

export function saveFormConfig(cfg: FormConfig) {
  localStorage.setItem(FORM_CONFIG_KEY, JSON.stringify(cfg));
}

// ── API Helpers ──

function apiHeaders(cfg: AppConfig): Record<string, string> {
  return {
    'X-N8N-API-KEY': cfg.apiKey,
    'X-TENANT-ID': cfg.tenantId,
    'Content-Type': 'application/json',
  };
}

function effectiveBase(cfg: AppConfig): string {
  return cfg.corsProxy || cfg.baseUrl;
}

function buildQueryString(filters: { since?: string; limit?: number }): string {
  const params = new URLSearchParams();
  if (filters.since) params.set('since', new Date(filters.since).toISOString());
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? '?' + qs : '';
}

export async function apiFetch<T>(
  cfg: AppConfig,
  path: string,
  filters: { since?: string; limit?: number } = {},
): Promise<T> {
  const url = effectiveBase(cfg) + path + buildQueryString(filters);
  const resp = await fetch(url, { headers: apiHeaders(cfg) });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${body}`);
  }
  return resp.json();
}

export async function apiPatch<T>(cfg: AppConfig, path: string, body: unknown): Promise<T> {
  const url = effectiveBase(cfg) + path;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: apiHeaders(cfg),
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
  return resp.json();
}

/** Rewrite a callback URL to go through the proxy / same-origin. */
export function rewriteUrl(rawUrl: string, cfg: AppConfig): string {
  try {
    const parsed = new URL(rawUrl);
    const base = effectiveBase(cfg);
    if (base) {
      const baseParsed = new URL(base);
      parsed.protocol = baseParsed.protocol;
      parsed.host = baseParsed.host;
      return parsed.toString();
    }
    return parsed.pathname + parsed.search;
  } catch {
    return rawUrl;
  }
}

// ── Formatting helpers ──

export function shortId(id?: string | null): string {
  if (!id) return '—';
  return id.length > 12 ? id.slice(0, 8) + '…' : id;
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-CA', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}
