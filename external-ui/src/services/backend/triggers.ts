import { instance } from './axios';
import type {
  ApiTriggerItem,
  LimitedApiTriggerItem,
  Trigger,
  TriggerChefsTokenResponse,
  TriggerListResponse,
  TriggerPayload,
} from './trigger-types';
import { apiItemToTrigger, limitedApiItemToTrigger, payloadToCreateBody, payloadToUpdateBody } from './trigger-mappers';

export function getTriggers(params: { tenantId: string; signal?: AbortSignal }): Promise<TriggerListResponse> {
  return instance
    .get<{ data: (ApiTriggerItem | LimitedApiTriggerItem)[] }>('/ui-api/wil/triggers', {
      headers: { 'X-TENANT-ID': params.tenantId },
      signal: params.signal,
    })
    .then((res) => ({
      data: res.data.data.map((item) =>
        'triggerUrl' in item
          ? apiItemToTrigger(item as ApiTriggerItem, params.tenantId)
          : limitedApiItemToTrigger(item as LimitedApiTriggerItem, params.tenantId),
      ),
    }));
}

export function createTrigger(params: { tenantId: string; config: TriggerPayload; actorId: string }): Promise<Trigger> {
  return instance
    .post<ApiTriggerItem>('/ui-api/wil/triggers', payloadToCreateBody(params.config, params.actorId), {
      headers: { 'X-TENANT-ID': params.tenantId },
    })
    .then((res) => apiItemToTrigger(res.data, params.tenantId));
}

export function updateTrigger(params: {
  tenantId: string;
  triggerId: string;
  config: TriggerPayload;
  actorId: string;
}): Promise<Trigger> {
  return instance
    .put<ApiTriggerItem>(
      `/ui-api/wil/triggers/${params.triggerId}`,
      payloadToUpdateBody(params.config, params.actorId),
      { headers: { 'X-TENANT-ID': params.tenantId } },
    )
    .then((res) => apiItemToTrigger(res.data, params.tenantId));
}

export function getTriggerChefsToken(params: {
  tenantId: string;
  triggerId: string;
}): Promise<TriggerChefsTokenResponse> {
  return instance
    .post<TriggerChefsTokenResponse>(
      `/ui-api/wil/triggers/${params.triggerId}/chefs-token`,
      {},
      {
        headers: { 'X-TENANT-ID': params.tenantId },
      },
    )
    .then((res) => res.data);
}

export async function deleteTrigger(params: { tenantId: string; triggerId: string }): Promise<void> {
  await instance.delete(`/ui-api/wil/triggers/${params.triggerId}`, {
    headers: { 'X-TENANT-ID': params.tenantId },
  });
}

export function callbackTrigger(params: {
  tenantId: string;
  triggerId: string;
  body?: Record<string, unknown>;
}): Promise<{ success: boolean }> {
  return instance
    .post<{ success: boolean }>(`/ui-api/wil/triggers/${params.triggerId}/callback`, params.body ?? {}, {
      headers: { 'X-TENANT-ID': params.tenantId },
    })
    .then((res) => res.data);
}
