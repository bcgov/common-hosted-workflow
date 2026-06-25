export type TriggerType = 'chefs-form' | 'button';
export type TriggerActorType = '' | 'role' | 'user' | 'group' | 'other';
export type TriggerMethod = 'POST' | 'GET';

export interface ChefsFormTriggerPayload {
  type: 'chefs-form';
  formId: string;
  formName: string;
  apiKey: string;
  allowedActors: string;
  allowedActorsType: TriggerActorType;
  callbackWebhookUrl: string;
  triggerMethod: TriggerMethod;
  includeActorId: boolean;
}

export interface ButtonTriggerPayload {
  type: 'button';
  buttonText: string;
  webhookUrl: string;
  postBody: string;
  allowedActors: string;
  allowedActorsType: TriggerActorType;
  triggerMethod: TriggerMethod;
  includeActorId: boolean;
}

export type TriggerPayload = ChefsFormTriggerPayload | ButtonTriggerPayload;

export interface Trigger {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  config: TriggerPayload;
}

export interface TriggerListResponse {
  data: Trigger[];
}

export function getTriggers(params: { tenantId: string; signal?: AbortSignal }): Promise<TriggerListResponse> {
  // replace with real API call when backend is ready:
  // return instance
  //   .get<TriggerListResponse>('/ui-api/triggers', {
  //     headers: { 'X-TENANT-ID': params.tenantId },
  //     signal: params.signal,
  //   })
  //   .then((res) => res.data);
  console.log('[getTriggers] tenantId:', params.tenantId);
  return Promise.resolve({ data: [] });
}

export function createTrigger(params: { tenantId: string; config: TriggerPayload }): Promise<Trigger> {
  // replace with real API call when backend is ready:
  // return instance
  //   .post<Trigger>('/ui-api/triggers', { config: params.config }, { headers: { 'X-TENANT-ID': params.tenantId } })
  //   .then((res) => res.data);
  console.log('[createTrigger] tenantId:', params.tenantId, 'config:', params.config);
  return Promise.resolve({
    id: `trigger-${Date.now()}`,
    tenantId: params.tenantId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: params.config,
  });
}

export function updateTrigger(params: {
  tenantId: string;
  triggerId: string;
  config: TriggerPayload;
}): Promise<Trigger> {
  // replace with real API call when backend is ready:
  // return instance
  //   .put<Trigger>(
  //     `/ui-api/triggers/${params.triggerId}`,
  //     { config: params.config },
  //     { headers: { 'X-TENANT-ID': params.tenantId } },
  //   )
  //   .then((res) => res.data);
  console.log('[updateTrigger] tenantId:', params.tenantId, 'triggerId:', params.triggerId, 'config:', params.config);
  return Promise.resolve({
    id: params.triggerId,
    tenantId: params.tenantId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: params.config,
  });
}
