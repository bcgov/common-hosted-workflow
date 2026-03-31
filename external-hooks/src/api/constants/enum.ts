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
