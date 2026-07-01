import type { ApiTriggerItem, Trigger, TriggerActorType, TriggerMethod, TriggerPayload } from './trigger-types';
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
  const allowedActors = item.allowedActors.join(',');
  const allowedActorsType = item.allowedActorsType as TriggerActorType;
  const triggerMethod = item.triggerMethod as TriggerMethod;
  const includeActorId = (meta.includeActorId as boolean) ?? false;

  let config: TriggerPayload;

  if (item.triggerType === TRIGGER_TYPES.CHEFS_FORM) {
    config = {
      type: TRIGGER_TYPES.CHEFS_FORM,
      formId: (meta.formId as string) ?? '',
      formName: (meta.formName as string) ?? '',
      // A non-empty placeholder value signals that a credential exists on the server.
      // An empty string means no credential is stored yet.
      apiKey: (meta.apiKey as string) ?? '',
      allowedActors,
      allowedActorsType,
      callbackWebhookUrl: item.triggerUrl,
      triggerMethod,
      includeActorId,
    };
  } else {
    config = {
      type: TRIGGER_TYPES.BUTTON,
      buttonText: (meta.buttonText as string) ?? '',
      webhookUrl: item.triggerUrl,
      postBody: (meta.postBody as string) ?? '',
      allowedActors,
      allowedActorsType,
      triggerMethod,
      includeActorId,
    };
  }

  return { id: item.id, tenantId, createdAt: item.createdAt, updatedAt: item.updatedAt, config };
}

/** Builds the POST /triggers request body from the FE payload. */
export function payloadToCreateBody(config: TriggerPayload, actorId: string) {
  if (config.type === TRIGGER_TYPES.CHEFS_FORM) {
    return {
      triggerType: TRIGGER_TYPES.CHEFS_FORM,
      triggerUrl: config.callbackWebhookUrl,
      triggerMethod: config.triggerMethod,
      metadata: {
        formId: config.formId,
        formName: config.formName,
        apiKey: config.apiKey,
        includeActorId: config.includeActorId,
      },
      allowedActorsType: config.allowedActorsType,
      allowedActors: splitActors(config.allowedActors),
      createdBy: actorId,
    };
  }
  return {
    triggerType: TRIGGER_TYPES.BUTTON,
    triggerUrl: config.webhookUrl,
    triggerMethod: config.triggerMethod,
    metadata: {
      buttonText: config.buttonText,
      postBody: config.postBody,
      includeActorId: config.includeActorId,
    },
    allowedActorsType: config.allowedActorsType,
    allowedActors: splitActors(config.allowedActors),
    createdBy: actorId,
  };
}

/** Builds the PUT /triggers/:id request body from the FE payload. */
export function payloadToUpdateBody(config: TriggerPayload, actorId: string) {
  if (config.type === TRIGGER_TYPES.CHEFS_FORM) {
    // Always send apiKey as-is; the backend decides whether it's a placeholder
    // (keep existing credential), empty (no change), or a real new value to persist.
    const metadata: Record<string, unknown> = {
      formId: config.formId,
      formName: config.formName,
      includeActorId: config.includeActorId,
      apiKey: config.apiKey,
    };
    return {
      triggerUrl: config.callbackWebhookUrl,
      triggerMethod: config.triggerMethod,
      metadata,
      allowedActorsType: config.allowedActorsType,
      allowedActors: splitActors(config.allowedActors),
      updatedBy: actorId,
    };
  }
  return {
    triggerUrl: config.webhookUrl,
    triggerMethod: config.triggerMethod,
    metadata: {
      buttonText: config.buttonText,
      postBody: config.postBody,
      includeActorId: config.includeActorId,
    },
    allowedActorsType: config.allowedActorsType,
    allowedActors: splitActors(config.allowedActors),
    updatedBy: actorId,
  };
}
