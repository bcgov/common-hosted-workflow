import type { UiResolvedSession } from '../../helpers/ui-oidc';
import { WorkflowTriggerTypeEnum } from '../../constants/enum';

type TriggerLike = { id: string; triggerType: string; metadata: unknown };

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseJsonObject(text: unknown): Record<string, unknown> {
  if (typeof text !== 'string' || !text) return {};
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return {};
  }
}

/** Display name of a trigger (form name or button label). */
export function triggerDisplayName(trigger: TriggerLike): string {
  const meta = asRecord(trigger.metadata);
  const name = trigger.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM ? meta.formName : meta.buttonText;
  return typeof name === 'string' ? name : '';
}

/**
 * Input handed to the node: button → configured `inputValues` (legacy `postBody` JSON as fallback),
 * CHEFS form → the submitted body.
 */
export function resolveTriggerInput(
  trigger: TriggerLike,
  requestBody: Record<string, unknown>,
): Record<string, unknown> {
  if (trigger.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM) return requestBody;
  const meta = asRecord(trigger.metadata);
  const configured = asRecord(meta.inputValues);
  return Object.keys(configured).length > 0 ? configured : parseJsonObject(meta.postBody);
}

/** The single item a WIL Trigger node emits (the node output contract). */
export function buildWilTriggerItem(params: {
  trigger: TriggerLike;
  session: UiResolvedSession;
  tenantId: string;
  requestBody: Record<string, unknown>;
  now?: Date;
}) {
  const { trigger, session, tenantId } = params;
  return {
    json: {
      source: 'wil',
      trigger: { id: trigger.id, type: trigger.triggerType, name: triggerDisplayName(trigger) },
      actor: {
        email: session.email,
        tenantId,
        roles: session.tenantRoles.find((entry) => entry.tenantId === tenantId)?.roles ?? [],
        groups: session.tenantGroups.find((entry) => entry.tenantId === tenantId)?.groups ?? [],
      },
      input: resolveTriggerInput(trigger, params.requestBody),
      firedAt: (params.now ?? new Date()).toISOString(),
    } as Record<string, unknown>,
  };
}
