import { z } from 'zod';
import { workflowTrigger } from '../../db/schema/workflow-trigger';
import {
  workflowTriggerTypeZodEnum,
  triggerHttpMethodZodEnum,
  triggerActorTypeZodEnum,
  triggerTargetKindZodEnum,
  triggerTargetStatusZodEnum,
  WorkflowTriggerTypeEnum,
  type TriggerTargetStatus,
} from '../constants/enum';
import { CHEFS_API_KEY_PLACEHOLDER } from '@config';

/** Shape of a trigger as returned by the API (no raw credentials). */
export const triggerItemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  triggerType: z.string(),
  targetKind: triggerTargetKindZodEnum,
  targetWorkflowId: z.string().nullable(),
  targetNodeId: z.string().nullable(),
  /** Live state of an n8n-node target; null for URL triggers. */
  targetStatus: triggerTargetStatusZodEnum.nullable(),
  triggerUrl: z.string().nullable(),
  triggerMethod: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  allowedActorsType: z.string(),
  allowedActors: z.array(z.string()),
  authEnabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
});

export type TriggerItem = z.infer<typeof triggerItemSchema>;

/** Minimal trigger shape returned to non-editor users — no sensitive fields. */
export const triggerLimitedItemSchema = z.object({
  id: z.string(),
  triggerType: workflowTriggerTypeZodEnum,
  triggerName: z.string(),
  targetStatus: triggerTargetStatusZodEnum.nullable(),
  allowedActorsType: z.string(),
  allowedActors: z.array(z.string()),
});

export type TriggerLimitedItem = z.infer<typeof triggerLimitedItemSchema>;

export const listTriggersResponseSchema = z.object({
  data: z.array(triggerItemSchema),
});

export const listTriggersLimitedResponseSchema = z.object({
  data: z.array(triggerLimitedItemSchema),
});

export const createTriggerResponseSchema = triggerItemSchema;
export const updateTriggerResponseSchema = triggerItemSchema;

/** Target fields shared by create/update; `targetKind` defaults to the legacy 'url' when omitted. */
const urlTargetFields = {
  targetKind: z.literal('url'),
  triggerUrl: z.string().url('triggerUrl must be a valid URL').trim().min(1),
  triggerMethod: triggerHttpMethodZodEnum,
};
const nodeTargetFields = {
  targetKind: z.literal('n8n-node'),
  targetWorkflowId: z.string().trim().min(1).max(36),
  targetNodeId: z.string().trim().min(1).max(36),
};

const withDefaultTargetKind = (body: unknown) =>
  typeof body === 'object' && body !== null && !('targetKind' in body) ? { ...body, targetKind: 'url' } : body;

/** Builds a request body schema accepting either target variant (backwards compatible with URL-only clients). */
const triggerBodySchema = <T extends z.ZodRawShape>(common: T) =>
  z.preprocess(
    withDefaultTargetKind,
    z.discriminatedUnion('targetKind', [
      z.object({ ...urlTargetFields, ...common }).strict(),
      z.object({ ...nodeTargetFields, ...common }).strict(),
    ]),
  );

/** POST /ui-api/wil/triggers */
export const createTriggerSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  body: triggerBodySchema({
    triggerType: workflowTriggerTypeZodEnum,
    metadata: z.record(z.string(), z.unknown()),
    allowedActorsType: triggerActorTypeZodEnum,
    allowedActors: z.array(z.string()),
    authEnabled: z.boolean().optional().default(false),
    createdBy: z.string().trim().min(1).optional(),
  }),
});

/** PUT /ui-api/wil/triggers/:triggerId */
export const updateTriggerSchema = z.object({
  params: z.object({ triggerId: z.string().trim().min(1) }),
  query: z.record(z.string(), z.unknown()).optional(),
  body: triggerBodySchema({
    metadata: z.record(z.string(), z.unknown()),
    allowedActorsType: triggerActorTypeZodEnum,
    allowedActors: z.array(z.string()),
    authEnabled: z.boolean().optional().default(false),
    updatedBy: z.string().trim().min(1).optional(),
  }),
});

/** DELETE /ui-api/wil/triggers/:triggerId */
export const deleteTriggerSchema = z.object({
  params: z.object({ triggerId: z.string().trim().min(1) }),
  body: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** GET /ui-api/wil/triggers */
export const listTriggersSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

/** POST /ui-api/wil/triggers/:triggerId/callback */
export const callbackTriggerSchema = z.object({
  params: z.object({ triggerId: z.string().trim().min(1) }),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

/** `executionId`/`result` are set for n8n-node targets; `result` only when the node waits for the last node. */
export const callbackTriggerResponseSchema = z.object({
  success: z.boolean(),
  executionId: z.string().optional(),
  result: z.unknown().optional(),
});

/** POST /ui-api/wil/triggers/:triggerId/chefs-token */
export const getTriggerChefsTokenSchema = z.object({
  params: z.object({ triggerId: z.string().trim().min(1) }),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

export const getTriggerChefsTokenResponseSchema = z.object({
  authToken: z.string(),
  formId: z.string(),
  formName: z.string(),
  baseUrl: z.string(),
});

/**
 * Maps a DB trigger row to the limited wire response (for non-editor users).
 * Returns only the display name, type, and actor access fields — no URLs, credentials, or metadata.
 */
export function mapTriggerRowToLimitedResponse(
  row: typeof workflowTrigger.$inferSelect,
  targetStatus: TriggerTargetStatus | null = null,
): TriggerLimitedItem {
  const metadata = row.metadata as Record<string, unknown>;
  const triggerName =
    row.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM
      ? ((metadata.formName as string) ?? '')
      : ((metadata.buttonText as string) ?? '');

  return triggerLimitedItemSchema.parse({
    id: row.id,
    triggerType: row.triggerType,
    triggerName,
    targetStatus,
    allowedActorsType: row.allowedActorsType,
    allowedActors: row.allowedActors,
  });
}

/**
 * Maps a DB trigger row to the wire response shape.
 *
 * - Strips any raw apiKey that somehow survived to the metadata column (defensive).
 * - For chefs-form triggers with a linked credential (`hasCredential = true`), sets
 *   `metadata.apiKey` to `CHEFS_API_KEY_PLACEHOLDER` so the FE knows a key exists
 *   without receiving the plaintext value.
 */
export function mapTriggerRowToResponse(
  row: typeof workflowTrigger.$inferSelect,
  hasCredential = false,
  targetStatus: TriggerTargetStatus | null = null,
): TriggerItem {
  const metadata = { ...(row.metadata as Record<string, unknown>) };

  // Remove any raw apiKey from metadata (should already be stripped, but defensive)
  for (const key of Object.keys(metadata)) {
    if (key.toLowerCase() === 'apikey') {
      delete metadata[key];
    }
  }

  // Placeholder for chefs-form when a credential is stored server-side
  if (row.triggerType === WorkflowTriggerTypeEnum.CHEFS_FORM && hasCredential) {
    metadata.apiKey = CHEFS_API_KEY_PLACEHOLDER;
  }

  return triggerItemSchema.parse({
    id: row.id,
    projectId: row.projectId,
    triggerType: row.triggerType,
    targetKind: row.targetKind,
    targetWorkflowId: row.targetWorkflowId,
    targetNodeId: row.targetNodeId,
    targetStatus,
    triggerUrl: row.triggerUrl,
    triggerMethod: row.triggerMethod,
    metadata,
    allowedActorsType: row.allowedActorsType,
    allowedActors: row.allowedActors,
    authEnabled: row.authEnabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
  });
}
