import { z } from 'zod';
import { messages } from '../../db/schema/workflow-interaction-layer';
import { messageStatusZodEnum, workflowInteractionActorTypeZodEnum } from '../constants/enum';
import { limitQueryString, optionalSinceQueryParam } from '../helpers/list-query';
import { asParamRecord, emptyQueryValueToUndefined, flattenQueryParams } from '../utils/query-params-preprocess';
import { applyLowercaseToOptionalZodEnum, applyLowercaseToZodEnum } from '../utils/string';

export const messageItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  actorId: z.string(),
  actorType: z.string(),
  workflowInstanceId: z.string(),
  workflowId: z.string(),
  projectId: z.string(),
  status: z.string(),
  metadata: z.unknown().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** GET /v1/actors/:actorId/messages — query: `since`, `limit`, optional `workflowInstanceId`. */
export const listActorMessagesSchema = z.object({
  params: z.preprocess(asParamRecord, z.object({ actorId: z.string().trim().min(1) }).strict()),
  query: z.preprocess(
    flattenQueryParams,
    z
      .object({
        since: z.preprocess(emptyQueryValueToUndefined, optionalSinceQueryParam.optional()),
        limit: z.preprocess(emptyQueryValueToUndefined, limitQueryString.optional()),
        workflowInstanceId: z.preprocess(emptyQueryValueToUndefined, z.string().trim().min(1).optional()),
      })
      .strict(),
  ),
  body: z.record(z.string(), z.unknown()).optional(),
});

/** GET /v1/messages/ — query: `actorId`, `since`, `limit`, optional `workflowInstanceId`. */
export const listMessagesSchema = z.object({
  params: z.preprocess(asParamRecord, z.object({}).strict()),
  query: z.preprocess(
    flattenQueryParams,
    z
      .object({
        actorId: z.preprocess(emptyQueryValueToUndefined, z.string().trim().min(1).optional()),
        since: z.preprocess(emptyQueryValueToUndefined, optionalSinceQueryParam.optional()),
        limit: z.preprocess(emptyQueryValueToUndefined, limitQueryString.optional()),
        workflowInstanceId: z.preprocess(emptyQueryValueToUndefined, z.string().trim().min(1).optional()),
      })
      .strict(),
  ),
  body: z.record(z.string(), z.unknown()).optional(),
});

export const createMessageSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z.object({
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
    actorId: z.string().trim().min(1),
    actorType: applyLowercaseToZodEnum(workflowInteractionActorTypeZodEnum),
    workflowInstanceId: z.string().trim().min(1),
    workflowId: z.string().trim().min(1),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    status: applyLowercaseToOptionalZodEnum(messageStatusZodEnum),
  }),
});

export const listActorMessagesResponseSchema = z.array(messageItemSchema);
export const listMessagesResponseSchema = z.object({
  items: z.array(messageItemSchema),
  nextCursor: z.string().nullable(),
});
export const createMessageResponseSchema = messageItemSchema;

/** Maps a DB row to the wire response shape and validates with `messageItemSchema`. */
export function mapMessageRowToResponse(item: typeof messages.$inferSelect) {
  return messageItemSchema.parse({
    id: item.id,
    title: item.title,
    body: item.body,
    actorId: item.actorId,
    actorType: item.actorType,
    workflowInstanceId: item.workflowInstanceId,
    workflowId: item.workflowId,
    projectId: item.projectId,
    status: item.status,
    metadata: item.metadata,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
}
