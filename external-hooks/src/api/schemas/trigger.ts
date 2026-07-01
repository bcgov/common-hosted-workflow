import { z } from 'zod';
import { workflowTrigger } from '../../db/schema/workflow-trigger';
import {
  workflowTriggerTypeZodEnum,
  triggerHttpMethodZodEnum,
  triggerActorTypeZodEnum,
  WorkflowTriggerTypeEnum,
} from '../constants/enum';
import { CHEFS_API_KEY_PLACEHOLDER } from '@config';

/** Shape of a trigger as returned by the API (no raw credentials). */
export const triggerItemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  triggerType: z.string(),
  triggerUrl: z.string(),
  triggerMethod: z.string(),
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

export const listTriggersResponseSchema = z.object({
  data: z.array(triggerItemSchema),
});

export const createTriggerResponseSchema = triggerItemSchema;
export const updateTriggerResponseSchema = triggerItemSchema;

/** POST /ui-api/wil/triggers */
export const createTriggerSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z
    .object({
      triggerType: workflowTriggerTypeZodEnum,
      triggerUrl: z.string().url('triggerUrl must be a valid URL').trim().min(1),
      triggerMethod: triggerHttpMethodZodEnum,
      metadata: z.record(z.string(), z.unknown()),
      allowedActorsType: triggerActorTypeZodEnum,
      allowedActors: z.array(z.string()),
      authEnabled: z.boolean().optional().default(false),
      createdBy: z.string().trim().min(1).optional(),
    })
    .strict(),
});

/** PUT /ui-api/wil/triggers/:triggerId */
export const updateTriggerSchema = z.object({
  params: z.object({ triggerId: z.string().trim().min(1) }),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z
    .object({
      triggerUrl: z.string().url('triggerUrl must be a valid URL').trim().min(1),
      triggerMethod: triggerHttpMethodZodEnum,
      metadata: z.record(z.string(), z.unknown()),
      allowedActorsType: triggerActorTypeZodEnum,
      allowedActors: z.array(z.string()),
      authEnabled: z.boolean().optional().default(false),
      updatedBy: z.string().trim().min(1).optional(),
    })
    .strict(),
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

export const callbackTriggerResponseSchema = z.object({ success: z.boolean() });

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
 * Maps a DB trigger row to the wire response shape.
 *
 * - Strips any raw apiKey that somehow survived to the metadata column (defensive).
 * - For chefs-form triggers with a linked credential (`hasCredential = true`), sets
 *   `metadata.apiKey` to `CHEFS_API_KEY_PLACEHOLDER` so the FE knows a key exists
 *   without receiving the plaintext value.
 */
export function mapTriggerRowToResponse(row: typeof workflowTrigger.$inferSelect, hasCredential = false): TriggerItem {
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
