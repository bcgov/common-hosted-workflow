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

export interface FormConfig {
  webhookUrl: string;
}

// ── Defaults ──

export const DEFAULT_FORM_CONFIG: FormConfig = {
  webhookUrl: '',
};

// ── Persistence ──

const FORM_CONFIG_KEY = 'sdg_form_config';

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

// ── API Helpers (all calls go through /api/wil backend proxy) ──

function buildQueryString(filters: { since?: string; limit?: number }): string {
  const params = new URLSearchParams();
  if (filters.since) params.set('since', new Date(filters.since).toISOString());
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? '?' + qs : '';
}

export async function apiFetch<T>(path: string, filters: { since?: string; limit?: number } = {}): Promise<T> {
  const url = `/api/wil${path}${buildQueryString(filters)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${body}`);
  }
  return resp.json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const url = `/api/wil${path}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
  return resp.json();
}

/** Submit a callback through the backend proxy using the action ID.
 *  The backend fetches the callbackUrl server-side so it never reaches the browser. */
export async function apiCallback(actionId: string, body: unknown): Promise<void> {
  const resp = await fetch('/api/wil/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionId, body }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
}

// ── CHEFS API Helpers ──

export interface ChefsFormEntry {
  formId: string;
  formName: string;
}

/** Fetch the list of CHEFS forms available for a given actor. */
export async function fetchChefsFormsForActor(actorId: string): Promise<ChefsFormEntry[]> {
  const resp = await fetch(`/api/chefs/actors/${encodeURIComponent(actorId)}/forms`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
  const data = await resp.json();
  return data.forms as ChefsFormEntry[];
}

/** Get a short-lived JWT auth-token for rendering a CHEFS form. */
export async function fetchChefsToken(
  formId: string,
  actionId?: string,
): Promise<{ authToken: string; formName: string }> {
  const params = new URLSearchParams({ formId });
  if (actionId) params.set('actionId', actionId);
  const resp = await fetch(`/api/chefs/token?${params}`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
  const data = await resp.json();
  return { authToken: data.authToken as string, formName: (data.formName as string) || '' };
}

/** Forward a CHEFS form submission to the backend callback. */
export async function submitChefsForm(formId: string, submission: unknown, actorId?: string): Promise<void> {
  const resp = await fetch('/api/chefs/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formId, submission, actorId }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
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
