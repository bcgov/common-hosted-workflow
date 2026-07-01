import { z } from 'zod';

/**
 * Canonical string unions for workflow-interaction request validation.
 */

/** Shared by messages and action requests (`actor_type` / body `actorType`). */
export const WORKFLOW_INTERACTION_ACTOR_TYPES = ['user', 'role', 'group', 'system', 'other'] as const;
export type WorkflowInteractionActorType = (typeof WORKFLOW_INTERACTION_ACTOR_TYPES)[number];
export const workflowInteractionActorTypeZodEnum = z.enum(WORKFLOW_INTERACTION_ACTOR_TYPES);

/** Message row / create body `status`. */
export const MESSAGE_STATUS_VALUES = ['active', 'read'] as const;
export type MessageStatus = (typeof MESSAGE_STATUS_VALUES)[number];
export const messageStatusZodEnum = z.enum(MESSAGE_STATUS_VALUES);

/** Action request row / body `status`. */
export const ACTION_REQUEST_STATUS_VALUES = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
  'deleted',
] as const;
export type ActionRequestStatus = (typeof ACTION_REQUEST_STATUS_VALUES)[number];
export const actionRequestStatusZodEnum = z.enum(ACTION_REQUEST_STATUS_VALUES);

/** Action request `priority`. */
export const ACTION_REQUEST_PRIORITY_VALUES = ['critical', 'normal'] as const;
export type ActionRequestPriority = (typeof ACTION_REQUEST_PRIORITY_VALUES)[number];
export const actionRequestPriorityZodEnum = z.enum(ACTION_REQUEST_PRIORITY_VALUES);

/** Allowed HTTP verbs for action callback delivery. */
export const CALLBACK_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'NONE'] as const;
export type CallbackHttpMethod = (typeof CALLBACK_HTTP_METHODS)[number];
export const callbackHttpMethodZodEnum = z.enum(CALLBACK_HTTP_METHODS);

/** Workflow trigger types. */
export const WORKFLOW_TRIGGER_TYPES = ['chefs-form', 'button'] as const;
export type WorkflowTriggerType = (typeof WORKFLOW_TRIGGER_TYPES)[number];
export const workflowTriggerTypeZodEnum = z.enum(WORKFLOW_TRIGGER_TYPES);

/** Named constants for workflow trigger types — prefer these over inline string literals. */
export const WorkflowTriggerTypeEnum = {
  CHEFS_FORM: 'chefs-form' as WorkflowTriggerType,
  BUTTON: 'button' as WorkflowTriggerType,
} as const;

/** Allowed HTTP methods for workflow trigger invocation. */
export const TRIGGER_HTTP_METHODS = ['GET', 'POST'] as const;
export type TriggerHttpMethod = (typeof TRIGGER_HTTP_METHODS)[number];
export const triggerHttpMethodZodEnum = z.enum(TRIGGER_HTTP_METHODS);

/** Actor types for workflow trigger visibility/access control. */
export const TRIGGER_ACTOR_TYPES = ['role', 'user', 'group', 'other'] as const;
export type TriggerActorType = (typeof TRIGGER_ACTOR_TYPES)[number];
export const triggerActorTypeZodEnum = z.enum(TRIGGER_ACTOR_TYPES);
