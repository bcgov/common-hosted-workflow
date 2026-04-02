import { z } from 'zod';
import { actionRequests } from '../../db/schema/workflow-interaction-layer';
import {
  actionRequestPriorityZodEnum,
  actionRequestStatusZodEnum,
  callbackHttpMethodZodEnum,
  workflowInteractionActorTypeZodEnum,
} from '../constants/enum';
import { limitQueryString, optionalSinceOrCursorQueryParam } from '../helpers/list-query';
import { parseOptionalBodyTimestamp } from '../utils/parse';
import { asParamRecord, emptyQueryValueToUndefined, flattenQueryParams } from '../utils/query-params-preprocess';
import { applyLowercaseToOptionalZodEnum, applyLowercaseToZodEnum } from '../utils/string';

export const actionRequestItemSchema = z.object({
  id: z.string(),
  actionType: z.string(),
  payload: z.record(z.string(), z.unknown()),
  callbackUrl: z.string(),
  callbackMethod: callbackHttpMethodZodEnum,
  callbackPayloadSpec: z.record(z.string(), z.unknown()).nullable(),
  actorId: z.string(),
  actorType: z.string(),
  workflowInstanceId: z.string(),
  workflowId: z.string(),
  projectId: z.string(),
  status: z.string(),
  priority: z.string(),
  dueDate: z.date().nullable(),
  checkIn: z.date().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const listActionsQueryShape = z
  .object({
    actorId: z.preprocess(emptyQueryValueToUndefined, z.string().trim().min(1).optional()),
    since: z.preprocess(emptyQueryValueToUndefined, optionalSinceOrCursorQueryParam.optional()),
    limit: z.preprocess(emptyQueryValueToUndefined, limitQueryString.optional()),
    workflowInstanceId: z.preprocess(emptyQueryValueToUndefined, z.string().trim().min(1).optional()),
  })
  .strict();

const listActorActionsQueryShape = z
  .object({
    since: z.preprocess(emptyQueryValueToUndefined, optionalSinceOrCursorQueryParam.optional()),
    limit: z.preprocess(emptyQueryValueToUndefined, limitQueryString.optional()),
    workflowInstanceId: z.preprocess(emptyQueryValueToUndefined, z.string().trim().min(1).optional()),
  })
  .strict();

/** GET /v1/actions */
export const listActionsSchema = z.object({
  params: z.preprocess(asParamRecord, z.object({}).strict()),
  query: z.preprocess(flattenQueryParams, listActionsQueryShape),
  body: z.record(z.string(), z.unknown()).optional(),
});

/** GET /v1/actors/:actorId/actions */
export const listActorActionsSchema = z.object({
  params: z.preprocess(asParamRecord, z.object({ actorId: z.string().trim().min(1) }).strict()),
  query: z.preprocess(flattenQueryParams, listActorActionsQueryShape),
  body: z.record(z.string(), z.unknown()).optional(),
});

/** GET /v1/actions/:actionId */
export const getActionByIdSchema = z.object({
  params: z.preprocess(asParamRecord, z.object({ actionId: z.string().trim().min(1) }).strict()),
  query: z.preprocess(flattenQueryParams, z.object({}).strict()),
  body: z.record(z.string(), z.unknown()).optional(),
});

/** GET /v1/actors/:actorId/actions/:actionId */
export const getActorActionByIdSchema = z.object({
  params: z.preprocess(
    asParamRecord,
    z
      .object({
        actorId: z.string().trim().min(1),
        actionId: z.string().trim().min(1),
      })
      .strict(),
  ),
  query: z.preprocess(flattenQueryParams, z.object({}).strict()),
  body: z.record(z.string(), z.unknown()).optional(),
});

/** PATCH /v1/actions/:actionId */
export const patchActionStatusByIdSchema = z.object({
  params: z.preprocess(asParamRecord, z.object({ actionId: z.string().trim().min(1) }).strict()),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z.object({
    status: applyLowercaseToZodEnum(actionRequestStatusZodEnum),
  }),
});

/** PATCH /v1/actors/:actorId/actions/:actionId */
export const patchActorActionStatusSchema = z.object({
  params: z.preprocess(
    asParamRecord,
    z
      .object({
        actorId: z.string().trim().min(1),
        actionId: z.string().trim().min(1),
      })
      .strict(),
  ),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z.object({
    status: applyLowercaseToZodEnum(actionRequestStatusZodEnum),
  }),
});

// Structural parse first; `superRefine` rejects unparseable date strings for dueDate/checkIn.
export const createActionRequestSchema = z
  .object({
    params: z.record(z.string(), z.unknown()).optional(),
    query: z.record(z.string(), z.unknown()).optional(),
    body: z
      .object({
        actionType: z.string().trim().min(1),
        payload: z.record(z.string(), z.unknown()),
        callbackUrl: z.string().trim().min(1),
        callbackMethod: z
          .string()
          .trim()
          .transform((s) => s.toUpperCase())
          .pipe(callbackHttpMethodZodEnum)
          .optional(),
        callbackPayloadSpec: z.record(z.string(), z.unknown()).nullable().optional(),
        actorId: z.string().trim().min(1),
        actorType: applyLowercaseToZodEnum(workflowInteractionActorTypeZodEnum),
        workflowInstanceId: z.string().trim().min(1),
        workflowId: z.string().trim().min(1),
        status: applyLowercaseToOptionalZodEnum(actionRequestStatusZodEnum),
        priority: applyLowercaseToOptionalZodEnum(actionRequestPriorityZodEnum),
        dueDate: z.union([z.string(), z.null()]).optional(),
        checkIn: z.union([z.string(), z.null()]).optional(),
        metadata: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .strict(),
  })
  .superRefine((data, ctx) => {
    const { dueDate, checkIn } = data.body;
    if (dueDate !== undefined && dueDate !== null) {
      const d = parseOptionalBodyTimestamp(dueDate);
      if (d === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid dueDate', path: ['body', 'dueDate'] });
      }
    }
    if (checkIn !== undefined && checkIn !== null) {
      const d = parseOptionalBodyTimestamp(checkIn);
      if (d === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid checkIn', path: ['body', 'checkIn'] });
      }
    }
  });

export const listActionsResponseSchema = z.object({
  items: z.array(actionRequestItemSchema),
  nextCursor: z.string().nullable(),
});

export const patchActionStatusResponseSchema = z.object({
  status: z.string(),
  message: z.string(),
});

export const createActionRequestResponseSchema = actionRequestItemSchema;

/** Maps a DB row to the wire response shape. */
export function mapActionRequestRowToResponse(item: typeof actionRequests.$inferSelect) {
  return actionRequestItemSchema.parse({
    id: item.id,
    actionType: item.actionType,
    payload: item.payload as Record<string, unknown>,
    callbackUrl: item.callbackUrl,
    callbackMethod: item.callbackMethod,
    callbackPayloadSpec: (item.callbackPayloadSpec as Record<string, unknown> | null) ?? null,
    actorId: item.actorId,
    actorType: item.actorType,
    workflowInstanceId: item.workflowInstanceId,
    workflowId: item.workflowId,
    projectId: item.projectId,
    status: item.status,
    priority: item.priority,
    dueDate: item.dueDate,
    checkIn: item.checkIn,
    metadata: item.metadata,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
}
