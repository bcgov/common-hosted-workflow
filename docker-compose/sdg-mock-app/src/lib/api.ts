import type {
  PlaygroundSummary,
  PlaygroundDetail,
  CreatePlaygroundRequest,
  UpdatePlaygroundRequest,
  PlaygroundExport,
  ConnectionTestResult,
} from '@/types/playground';

// ── Playground Context ──

let currentPlayground: string | null = null;

/** Set the active playground name. All subsequent API calls will include the X-PLAYGROUND-ID header. */
export function setPlaygroundContext(name: string | null): void {
  currentPlayground = name;
}

/** Get the currently active playground name. */
export function getPlaygroundContext(): string | null {
  return currentPlayground;
}

/** Returns the X-PLAYGROUND-ID header object when a playground is active, or empty object. */
function playgroundHeaders(): Record<string, string> {
  if (currentPlayground) {
    return { 'X-PLAYGROUND-ID': currentPlayground };
  }
  return {};
}

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
  const resp = await fetch(url, {
    headers: { ...playgroundHeaders() },
  });
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
    headers: { 'Content-Type': 'application/json', ...playgroundHeaders() },
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
    headers: { 'Content-Type': 'application/json', ...playgroundHeaders() },
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
  const resp = await fetch(`/api/chefs/actors/${encodeURIComponent(actorId)}/forms`, {
    headers: { ...playgroundHeaders() },
  });
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
  const resp = await fetch(`/api/chefs/token?${params}`, {
    headers: { ...playgroundHeaders() },
  });
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
    headers: { 'Content-Type': 'application/json', ...playgroundHeaders() },
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

// ── Playground CRUD API Helpers ──

/** Fetch all playgrounds owned by the given tester. */
export async function fetchPlaygrounds(owner: string): Promise<PlaygroundSummary[]> {
  const params = new URLSearchParams({ owner });
  const resp = await fetch(`/api/playgrounds?${params}`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
  const data = await resp.json();
  return data.playgrounds as PlaygroundSummary[];
}

/** Fetch full detail for a single playground (including sensitive fields). */
export async function fetchPlayground(name: string): Promise<PlaygroundDetail> {
  const resp = await fetch(`/api/playgrounds/${encodeURIComponent(name)}`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
  return resp.json();
}

/** Create a new playground. */
export async function createPlayground(data: CreatePlaygroundRequest): Promise<void> {
  const resp = await fetch('/api/playgrounds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
}

/** Update an existing playground's configuration. */
export async function updatePlayground(name: string, data: UpdatePlaygroundRequest): Promise<void> {
  const resp = await fetch(`/api/playgrounds/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
}

/** Delete a playground. */
export async function deletePlayground(name: string): Promise<void> {
  const resp = await fetch(`/api/playgrounds/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
}

/** Clone a playground under a new name. */
export async function clonePlayground(name: string, newName: string, owner: string): Promise<void> {
  const resp = await fetch(`/api/playgrounds/${encodeURIComponent(name)}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName, owner }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
}

/** Export a playground's full configuration as JSON. */
export async function exportPlayground(name: string): Promise<PlaygroundExport> {
  const resp = await fetch(`/api/playgrounds/${encodeURIComponent(name)}/export`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
  return resp.json();
}

/** Import a playground from an exported configuration. */
export async function importPlayground(name: string, owner: string, config: PlaygroundExport): Promise<void> {
  const resp = await fetch('/api/playgrounds/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, owner, config }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
}

/** Test connectivity to a playground's configured n8n instance. */
export async function testConnection(name: string): Promise<ConnectionTestResult> {
  const resp = await fetch(`/api/playgrounds/${encodeURIComponent(name)}/test-connection`, {
    method: 'POST',
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status}: ${text}`);
  }
  return resp.json();
}
