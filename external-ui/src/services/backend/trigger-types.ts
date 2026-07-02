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
  postBody: string;
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

/** Shape of a single trigger as returned by the backend API. */
export type ApiTriggerItem = {
  id: string;
  projectId: string;
  triggerType: string;
  triggerUrl: string;
  triggerMethod: string;
  metadata: Record<string, unknown>;
  allowedActorsType: string;
  allowedActors: string[];
  authEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type TriggerChefsTokenResponse = {
  authToken: string;
  formId: string;
  formName: string;
  baseUrl: string;
};
