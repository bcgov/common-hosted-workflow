"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createActionRequestResponseSchema = exports.patchActionStatusResponseSchema = exports.listActionsResponseSchema = exports.createActionRequestSchema = exports.patchActorActionStatusSchema = exports.patchActionStatusByIdSchema = exports.getActorActionByIdSchema = exports.getActionByIdSchema = exports.listActorActionsSchema = exports.listActionsSchema = exports.actionRequestItemSchema = void 0;
exports.mapActionRequestRowToResponse = mapActionRequestRowToResponse;
const zod_1 = require("zod");
const enum_1 = require("../constants/enum");
const list_query_1 = require("../helpers/list-query");
const parse_1 = require("../utils/parse");
const query_params_preprocess_1 = require("../utils/query-params-preprocess");
const string_1 = require("../utils/string");
exports.actionRequestItemSchema = zod_1.z.object({
    id: zod_1.z.string(),
    actionType: zod_1.z.string(),
    actionTitle: zod_1.z.string().nullable(),
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    callbackUrl: zod_1.z.string(),
    callbackMethod: zod_1.z.string(),
    callbackPayloadSpec: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).nullable(),
    actorId: zod_1.z.string(),
    actorType: zod_1.z.string(),
    workflowInstanceId: zod_1.z.string(),
    workflowId: zod_1.z.string(),
    projectId: zod_1.z.string(),
    status: zod_1.z.string(),
    priority: zod_1.z.string(),
    dueDate: zod_1.z.date().nullable(),
    checkIn: zod_1.z.date().nullable(),
    metadata: zod_1.z.unknown().nullable(),
    claimedBy: zod_1.z.string().nullable(),
    claimedAt: zod_1.z.date().nullable(),
    completedBy: zod_1.z.string().nullable(),
    completedAt: zod_1.z.date().nullable(),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
});
const listActionsQueryShape = zod_1.z
    .object({
    actorId: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, zod_1.z.string().trim().min(1).optional()),
    since: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, list_query_1.optionalSinceOrCursorQueryParam.optional()),
    limit: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, list_query_1.limitQueryString.optional()),
    workflowInstanceId: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, zod_1.z.string().trim().min(1).optional()),
})
    .strict();
const listActorActionsQueryShape = zod_1.z
    .object({
    since: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, list_query_1.optionalSinceOrCursorQueryParam.optional()),
    limit: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, list_query_1.limitQueryString.optional()),
    workflowInstanceId: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, zod_1.z.string().trim().min(1).optional()),
})
    .strict();
/** GET /v1/actions */
exports.listActionsSchema = zod_1.z.object({
    params: zod_1.z.preprocess(query_params_preprocess_1.asParamRecord, zod_1.z.object({}).strict()),
    query: zod_1.z.preprocess(query_params_preprocess_1.flattenQueryParams, listActionsQueryShape),
    body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** GET /v1/actors/:actorId/actions */
exports.listActorActionsSchema = zod_1.z.object({
    params: zod_1.z.preprocess(query_params_preprocess_1.asParamRecord, zod_1.z.object({ actorId: zod_1.z.string().trim().min(1) }).strict()),
    query: zod_1.z.preprocess(query_params_preprocess_1.flattenQueryParams, listActorActionsQueryShape),
    body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** GET /v1/actions/:actionId */
exports.getActionByIdSchema = zod_1.z.object({
    params: zod_1.z.preprocess(query_params_preprocess_1.asParamRecord, zod_1.z.object({ actionId: zod_1.z.string().trim().min(1) }).strict()),
    query: zod_1.z.preprocess(query_params_preprocess_1.flattenQueryParams, zod_1.z.object({}).strict()),
    body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** GET /v1/actors/:actorId/actions/:actionId */
exports.getActorActionByIdSchema = zod_1.z.object({
    params: zod_1.z.preprocess(query_params_preprocess_1.asParamRecord, zod_1.z
        .object({
        actorId: zod_1.z.string().trim().min(1),
        actionId: zod_1.z.string().trim().min(1),
    })
        .strict()),
    query: zod_1.z.preprocess(query_params_preprocess_1.flattenQueryParams, zod_1.z.object({}).strict()),
    body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** PATCH /v1/actions/:actionId */
exports.patchActionStatusByIdSchema = zod_1.z.object({
    params: zod_1.z.preprocess(query_params_preprocess_1.asParamRecord, zod_1.z.object({ actionId: zod_1.z.string().trim().min(1) }).strict()),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z.object({
        status: (0, string_1.applyLowercaseToZodEnum)(enum_1.actionRequestStatusZodEnum).optional(),
        claimedBy: zod_1.z.string().nullable().optional(),
        claimedAt: zod_1.z.string().nullable().optional(),
        completedBy: zod_1.z.string().nullable().optional(),
        completedAt: zod_1.z.string().nullable().optional(),
    }),
});
/** PATCH /v1/actors/:actorId/actions/:actionId */
exports.patchActorActionStatusSchema = zod_1.z.object({
    params: zod_1.z.preprocess(query_params_preprocess_1.asParamRecord, zod_1.z
        .object({
        actorId: zod_1.z.string().trim().min(1),
        actionId: zod_1.z.string().trim().min(1),
    })
        .strict()),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z.object({
        status: (0, string_1.applyLowercaseToZodEnum)(enum_1.actionRequestStatusZodEnum).optional(),
        claimedBy: zod_1.z.string().nullable().optional(),
        claimedAt: zod_1.z.string().nullable().optional(),
        completedBy: zod_1.z.string().nullable().optional(),
        completedAt: zod_1.z.string().nullable().optional(),
    }),
});
// Structural parse first; `superRefine` rejects unparseable date strings for dueDate/checkIn.
exports.createActionRequestSchema = zod_1.z
    .object({
    params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z
        .object({
        actionType: zod_1.z.string().trim().min(1),
        actionTitle: zod_1.z.string().trim().min(1).nullable().optional(),
        payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
        callbackUrl: zod_1.z.string().trim().optional().default(''),
        callbackMethod: zod_1.z
            .string()
            .trim()
            .transform((s) => s.toUpperCase())
            .pipe(enum_1.callbackHttpMethodZodEnum)
            .optional(),
        callbackPayloadSpec: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).nullable().optional(),
        actorId: zod_1.z.string().trim().min(1),
        actorType: (0, string_1.applyLowercaseToZodEnum)(enum_1.workflowInteractionActorTypeZodEnum),
        workflowInstanceId: zod_1.z.string().trim().min(1),
        workflowId: zod_1.z.string().trim().min(1),
        status: (0, string_1.applyLowercaseToOptionalZodEnum)(enum_1.actionRequestStatusZodEnum),
        priority: (0, string_1.applyLowercaseToOptionalZodEnum)(enum_1.actionRequestPriorityZodEnum),
        dueDate: zod_1.z.union([zod_1.z.string(), zod_1.z.null()]).optional(),
        checkIn: zod_1.z.union([zod_1.z.string(), zod_1.z.null()]).optional(),
        metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).nullable().optional(),
    })
        .strict(),
})
    .superRefine((data, ctx) => {
    const { callbackUrl, callbackMethod, dueDate, checkIn } = data.body;
    const method = callbackMethod ?? 'POST';
    if (method !== 'NONE' && (!callbackUrl || callbackUrl.length === 0)) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'callbackUrl is required when callbackMethod is not NONE',
            path: ['body', 'callbackUrl'],
        });
    }
    if (dueDate !== undefined && dueDate !== null) {
        const d = (0, parse_1.parseOptionalBodyTimestamp)(dueDate);
        if (d === undefined) {
            ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'Invalid dueDate', path: ['body', 'dueDate'] });
        }
    }
    if (checkIn !== undefined && checkIn !== null) {
        const d = (0, parse_1.parseOptionalBodyTimestamp)(checkIn);
        if (d === undefined) {
            ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'Invalid checkIn', path: ['body', 'checkIn'] });
        }
    }
});
exports.listActionsResponseSchema = zod_1.z.object({
    items: zod_1.z.array(exports.actionRequestItemSchema),
    nextCursor: zod_1.z.string().nullable(),
});
exports.patchActionStatusResponseSchema = zod_1.z.object({
    status: zod_1.z.string(),
    message: zod_1.z.string(),
});
exports.createActionRequestResponseSchema = exports.actionRequestItemSchema;
/** Maps a DB row to the wire response shape. */
function mapActionRequestRowToResponse(item) {
    return exports.actionRequestItemSchema.parse({
        id: item.id,
        actionType: item.actionType,
        actionTitle: item.actionTitle ?? null,
        payload: item.payload,
        callbackUrl: item.callbackUrl,
        callbackMethod: item.callbackMethod,
        callbackPayloadSpec: item.callbackPayloadSpec ?? null,
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
        claimedBy: item.claimedBy ?? null,
        claimedAt: item.claimedAt ?? null,
        completedBy: item.completedBy ?? null,
        completedAt: item.completedAt ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
    });
}
