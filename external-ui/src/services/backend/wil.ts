import { instance } from './axios';

export type WilTenantItem = {
  id: string;
  name: string;
  source: 'cstar' | 'personal';
  projectId?: string;
};

export type WilTenantsResponse = {
  tenants: WilTenantItem[];
};

export type WilActionItem = {
  id: string;
  actionType: string;
  payload: Record<string, unknown>;
  actorId: string;
  actorType?: string;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'claimed' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'deleted';
  priority: 'critical' | 'normal';
  dueDate: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  completedBy: string | null;
  completedAt: string | null;
};

export type WilMessageItem = {
  id: string;
  title: string;
  body: string;
  actorId: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'read';
};

export type WilListResponse<T> = {
  data: T[];
  nextCursor: string | null;
};

export type WilListParams = {
  tenantId: string;
  limit?: number;
  since?: string;
  status?: string[];
  signal?: AbortSignal;
};

export type WilChefsTokenResponse = {
  authToken: string;
  formId: string;
  formName: string;
  baseUrl: string;
};

export function getWilMessages(params: WilListParams) {
  return instance
    .get<WilListResponse<WilMessageItem>>('/ui-api/wil/messages', {
      params: { limit: params.limit, since: params.since },
      headers: { 'X-TENANT-ID': params.tenantId },
      signal: params.signal,
    })
    .then((res) => res.data);
}

export function getWilActions(params: WilListParams) {
  return instance
    .get<WilListResponse<WilActionItem>>('/ui-api/wil/actions', {
      params: { limit: params.limit, since: params.since, status: params.status },
      headers: { 'X-TENANT-ID': params.tenantId },
      signal: params.signal,
    })
    .then((res) => res.data);
}

export function getWilTenants(signal?: AbortSignal) {
  return instance.get<WilTenantsResponse>('/ui-api/wil/tenants', { signal }).then((res) => res.data);
}

export function postWilCallback(params: { tenantId: string; actionId: string; body: Record<string, unknown> }) {
  return instance
    .post<void>(
      '/ui-api/wil/callback',
      { actionId: params.actionId, body: params.body },
      {
        headers: { 'X-TENANT-ID': params.tenantId },
      },
    )
    .then((res) => res.data);
}

export function postWilChefsToken(params: { tenantId: string; actionId: string }) {
  return instance
    .post<WilChefsTokenResponse>(
      '/ui-api/wil/chefs-token',
      { actionId: params.actionId },
      {
        headers: { 'X-TENANT-ID': params.tenantId },
      },
    )
    .then((res) => res.data);
}

export function postWilClaimAction(params: { tenantId: string; actionId: string }) {
  return instance
    .post<WilActionItem>(
      `/ui-api/wil/actions/${params.actionId}/claim`,
      {},
      { headers: { 'X-TENANT-ID': params.tenantId } },
    )
    .then((res) => res.data);
}

export function postWilUnclaimAction(params: { tenantId: string; actionId: string }) {
  return instance
    .post<WilActionItem>(
      `/ui-api/wil/actions/${params.actionId}/unclaim`,
      {},
      { headers: { 'X-TENANT-ID': params.tenantId } },
    )
    .then((res) => res.data);
}

export function postWilStartAction(params: { tenantId: string; actionId: string }) {
  return instance
    .post<WilActionItem>(
      `/ui-api/wil/actions/${params.actionId}/start`,
      {},
      { headers: { 'X-TENANT-ID': params.tenantId } },
    )
    .then((res) => res.data);
}
