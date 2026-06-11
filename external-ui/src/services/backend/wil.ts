import { instance } from './axios';

export type WilTenantItem = {
  id: string;
  name: string;
};

export type WilTenantsResponse = {
  tenants: WilTenantItem[];
};

export type WilActionItem = {
  id: string;
  actionType: string;
  payload: Record<string, unknown>;
  actorId: string;
  workflowId: string | null;
  workflowInstanceId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | 'deleted';
  priority: 'critical' | 'normal';
  dueDate: string | null;
  metadata: Record<string, unknown> | null;
};

export type WilMessageItem = {
  id: string;
  title: string;
  body: string;
  actorId: string;
  workflowId: string | null;
  workflowInstanceId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'read';
  metadata: Record<string, unknown> | null;
};

export type WilListResponse<T> = {
  data: T[];
  nextCursor: string | null;
};

export type WilListParams = {
  tenantId: string;
  limit?: number;
  since?: string;
  signal?: AbortSignal;
};

export async function getWilMessages(params: WilListParams) {
  return instance
    .get<WilListResponse<WilMessageItem>>('/ui-api/wil/messages', {
      params: { limit: params.limit, since: params.since },
      headers: { 'X-TENANT-ID': params.tenantId },
      signal: params.signal,
    })
    .then((res) => res.data);
}

export async function getWilActions(params: WilListParams) {
  return instance
    .get<WilListResponse<WilActionItem>>('/ui-api/wil/actions', {
      params: { limit: params.limit, since: params.since },
      headers: { 'X-TENANT-ID': params.tenantId },
      signal: params.signal,
    })
    .then((res) => res.data);
}

export async function getWilTenants(signal?: AbortSignal) {
  return instance.get<WilTenantsResponse>('/ui-api/wil/tenants', { signal }).then((res) => res.data);
}
