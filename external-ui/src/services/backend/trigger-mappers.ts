import type {
  ApiTriggerItem,
  ButtonTriggerPayload,
  ChefsFormTriggerPayload,
  LimitedApiTriggerItem,
  Trigger,
  TriggerActorType,
  TriggerMethod,
  TriggerPayload,
} from './trigger-types';
import { TRIGGER_TYPES } from '../../constants/constants';

/** Converts the FE's comma-separated allowedActors string to the array the API expects. */
export function splitActors(raw: string): string[] {
  if (raw.trim() === '*') return ['*'];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Reconstructs the FE Trigger shape from a flat API response item. */
export function apiItemToTrigger(item: ApiTriggerItem, tenantId: string): Trigger {
  const meta = item.metadata;
  const isAllActors = item.allowedActors.includes('*');
  const allowedActors = isAllActors ? '*' : item.allowedActors.join(',');
  const allowedActorsType: TriggerActorType = isAllActors ? 'all' : (item.allowedActorsType as TriggerActorType);
  const triggerMethod = (item.triggerMethod ?? 'POST') as TriggerMethod;
  const triggerUrl = item.triggerUrl ?? '';
  const target = {
    targetKind: item.targetKind ?? 'url',
    targetWorkflowId: item.targetWorkflowId ?? '',
    targetNodeId: item.targetNodeId ?? '',
  } as const;
  const includeActorId = (meta.includeActorId as boolean) ?? false;

  let config: TriggerPayload;

  if (item.triggerType === TRIGGER_TYPES.CHEFS_FORM) {
    config = {
      type: TRIGGER_TYPES.CHEFS_FORM,
      n8nCredentialId: (meta.n8nCredentialId as string) ?? '',
      formId: (meta.formId as string) ?? '',
      formName: (meta.formName as string) ?? '',
      baseUrl: (meta.baseUrl as string) ?? '',
      // A non-empty placeholder value signals that a legacy private key exists on the server.
      // An empty string means no private key is stored.
      apiKey: (meta.apiKey as string) ?? '',
      postBody: (meta.postBody as string) ?? '',
      allowedActors,
      allowedActorsType,
      callbackWebhookUrl: triggerUrl,
      triggerMethod,
      includeActorId,
      ...target,
    };
  } else {
    config = {
      type: TRIGGER_TYPES.BUTTON,
      buttonText: (meta.buttonText as string) ?? '',
      webhookUrl: triggerUrl,
      postBody: (meta.postBody as string) ?? '',
      allowedActors,
      allowedActorsType,
      triggerMethod,
      includeActorId,
      inputValues: (meta.inputValues as Record<string, unknown> | undefined) ?? {},
      ...target,
    };
  }

  return {
    id: item.id,
    tenantId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    config,
    targetStatus: item.targetStatus ?? null,
  };
}

/** Converts a limited API response (non-editor users) to a Trigger with minimal config for display. */
export function limitedApiItemToTrigger(item: LimitedApiTriggerItem, tenantId: string): Trigger {
  const isAllActors = item.allowedActors.includes('*');
  const allowedActors = isAllActors ? '*' : item.allowedActors.join(',');
  const allowedActorsType: TriggerActorType = isAllActors ? 'all' : (item.allowedActorsType as TriggerActorType);

  const config: TriggerPayload =
    item.triggerType === TRIGGER_TYPES.CHEFS_FORM
      ? {
          type: TRIGGER_TYPES.CHEFS_FORM,
          n8nCredentialId: '',
          formId: '',
          formName: item.triggerName,
          baseUrl: '',
          apiKey: '',
          postBody: '',
          allowedActors,
          allowedActorsType,
          callbackWebhookUrl: '',
          triggerMethod: 'POST',
          includeActorId: true,
        }
      : {
          type: TRIGGER_TYPES.BUTTON,
          buttonText: item.triggerName,
          webhookUrl: '',
          postBody: '',
          allowedActors,
          allowedActorsType,
          triggerMethod: 'POST',
          includeActorId: true,
        };

  return { id: item.id, tenantId, createdAt: '', updatedAt: '', config, targetStatus: item.targetStatus ?? null };
}

/**
 * CHEFS trigger metadata sent to the API.
 * Once an n8n credential is selected, the API key is omitted so the server
 * resolves the form from that credential instead of a private key.
 */
function chefsFormMetadata(config: ChefsFormTriggerPayload): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    n8nCredentialId: config.n8nCredentialId,
    formId: config.formId,
    formName: config.formName,
    baseUrl: config.baseUrl,
    includeActorId: config.includeActorId,
  };
  if (config.targetKind !== 'n8n-node') metadata.postBody = config.postBody;
  if (!config.n8nCredentialId) {
    metadata.apiKey = config.apiKey;
  }
  return metadata;
}

/** Target fields of a request body: workflow + node for node targets, URL + method otherwise. */
function targetBody(config: TriggerPayload, url: string) {
  if (config.targetKind === 'n8n-node') {
    return {
      targetKind: 'n8n-node' as const,
      targetWorkflowId: config.targetWorkflowId ?? '',
      targetNodeId: config.targetNodeId ?? '',
    };
  }
  return { triggerUrl: url, triggerMethod: config.triggerMethod };
}

function buttonMetadata(config: ButtonTriggerPayload): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    buttonText: config.buttonText,
    postBody: config.postBody,
    includeActorId: config.includeActorId,
  };
  if (config.targetKind === 'n8n-node') {
    metadata.inputValues = config.inputValues ?? {};
    delete metadata.postBody; // legacy URL-only field
  }
  return metadata;
}

/** Fields common to create and update bodies. */
function commonBody(config: TriggerPayload) {
  const isChefs = config.type === TRIGGER_TYPES.CHEFS_FORM;
  return {
    ...(isChefs ? targetBody(config, config.callbackWebhookUrl) : targetBody(config, config.webhookUrl)),
    metadata: isChefs ? chefsFormMetadata(config) : buttonMetadata(config),
    allowedActorsType: config.allowedActorsType,
    allowedActors: splitActors(config.allowedActors),
  };
}

/** Builds the POST /triggers request body from the FE payload. */
export function payloadToCreateBody(config: TriggerPayload, actorId: string) {
  return { triggerType: config.type, ...commonBody(config), createdBy: actorId };
}

/** Builds the PUT /triggers/:id request body from the FE payload. */
export function payloadToUpdateBody(config: TriggerPayload, actorId: string) {
  return { ...commonBody(config), updatedBy: actorId };
}
