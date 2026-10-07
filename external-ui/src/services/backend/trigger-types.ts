export type TriggerType = 'chefs-form' | 'button';
export type TriggerActorType = '' | 'all' | 'role' | 'user' | 'group' | 'other';
export type TriggerMethod = 'POST' | 'GET';
/** 'n8n-node' runs a WIL Trigger node in a published n8n workflow; 'url' is the legacy outbound webhook. */
export type TriggerTargetKind = 'url' | 'n8n-node';
export type TriggerTargetStatus = 'live' | 'unpublished' | 'missing-node';

/** Fields shared by both trigger payloads. Optional so payloads saved before node targets still type-check. */
export interface TriggerTargetFields {
  targetKind?: TriggerTargetKind;
  targetWorkflowId?: string;
  targetNodeId?: string;
}

export type WilInputFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';
export interface WilInputField {
  name: string;
  type: WilInputFieldType;
}

/** A WIL Trigger node in a published workflow, as listed by GET /ui-api/wil/trigger-targets. */
export interface WilTriggerTarget {
  workflowId: string;
  workflowName: string;
  projectId: string;
  nodeId: string;
  nodeName: string;
  label: string;
  description: string;
  acceptedSources: TriggerType[];
  inputSource: string;
  inputSchema: WilInputField[];
  respondMode: 'immediately' | 'lastNode';
  responseTimeoutSec: number;
}

export interface TriggerTargetsResponse {
  data: WilTriggerTarget[];
  /** False when the backend kill switch is off. */
  enabled: boolean;
}

export interface TriggerCallbackResponse {
  success: boolean;
  executionId?: string;
  /** Last node output; only for `lastNode` targets that finished in time. */
  result?: unknown;
}

export interface ChefsFormTriggerPayload extends TriggerTargetFields {
  type: 'chefs-form';
  /** n8n `chefsFormAuth` credential id. Empty for triggers saved before credential selection. */
  n8nCredentialId: string;
  formId: string;
  formName: string;
  baseUrl: string;
  /** Legacy private key placeholder. Empty once an n8n credential is selected. */
  apiKey: string;
  allowedActors: string;
  allowedActorsType: TriggerActorType;
  callbackWebhookUrl: string;
  postBody: string;
  triggerMethod: TriggerMethod;
  includeActorId: boolean;
}

export interface ButtonTriggerPayload extends TriggerTargetFields {
  /** Values for the target node's declared input fields (node targets only). */
  inputValues?: Record<string, unknown>;
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
  /** Live state of a node target; null/undefined for URL triggers. */
  targetStatus?: TriggerTargetStatus | null;
}

export interface TriggerListResponse {
  data: Trigger[];
}

/** Shape of a single trigger as returned by the backend API (project:editor users). */
export type ApiTriggerItem = {
  id: string;
  projectId: string;
  triggerType: string;
  targetKind?: TriggerTargetKind;
  targetWorkflowId?: string | null;
  targetNodeId?: string | null;
  targetStatus?: TriggerTargetStatus | null;
  triggerUrl: string | null;
  triggerMethod: string | null;
  metadata: Record<string, unknown>;
  allowedActorsType: string;
  allowedActors: string[];
  authEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

/** Minimal trigger item returned to non-editor users — display name + actor access fields only. */
export type LimitedApiTriggerItem = {
  id: string;
  triggerType: TriggerType;
  triggerName: string;
  targetStatus?: TriggerTargetStatus | null;
  allowedActorsType: string;
  allowedActors: string[];
};

export type TriggerChefsTokenResponse = {
  authToken: string;
  formId: string;
  formName: string;
  baseUrl: string;
};
