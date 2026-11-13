"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessageResponseSchema = exports.listMessagesResponseSchema = exports.listActorMessagesResponseSchema = exports.createMessageSchema = exports.listMessagesSchema = exports.listActorMessagesSchema = exports.messageItemSchema = void 0;
exports.mapMessageRowToResponse = mapMessageRowToResponse;
const zod_1 = require("zod");
const enum_1 = require("../constants/enum");
const list_query_1 = require("../helpers/list-query");
const query_params_preprocess_1 = require("../utils/query-params-preprocess");
const string_1 = require("../utils/string");
exports.messageItemSchema = zod_1.z.object({
    id: zod_1.z.string(),
    title: zod_1.z.string(),
    body: zod_1.z.string(),
    actorId: zod_1.z.string(),
    actorType: zod_1.z.string(),
    workflowInstanceId: zod_1.z.string(),
    workflowId: zod_1.z.string(),
    projectId: zod_1.z.string(),
    status: zod_1.z.string(),
    metadata: zod_1.z.unknown().nullable(),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
});
/** GET /v1/actors/:actorId/messages — query: optional `since` (ISO or keyset), `limit`, optional `workflowInstanceId`. */
exports.listActorMessagesSchema = zod_1.z.object({
    params: zod_1.z.preprocess(query_params_preprocess_1.asParamRecord, zod_1.z.object({ actorId: zod_1.z.string().trim().min(1) }).strict()),
    query: zod_1.z.preprocess(query_params_preprocess_1.flattenQueryParams, zod_1.z
        .object({
        since: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, list_query_1.optionalSinceOrCursorQueryParam.optional()),
        limit: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, list_query_1.limitQueryString.optional()),
        workflowInstanceId: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, zod_1.z.string().trim().min(1).optional()),
    })
        .strict()),
    body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** GET /v1/messages/ — query: `actorId`, optional `since` (ISO or keyset), `limit`, optional `workflowInstanceId`. */
exports.listMessagesSchema = zod_1.z.object({
    params: zod_1.z.preprocess(query_params_preprocess_1.asParamRecord, zod_1.z.object({}).strict()),
    query: zod_1.z.preprocess(query_params_preprocess_1.flattenQueryParams, zod_1.z
        .object({
        actorId: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, zod_1.z.string().trim().min(1).optional()),
        since: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, list_query_1.optionalSinceOrCursorQueryParam.optional()),
        limit: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, list_query_1.limitQueryString.optional()),
        workflowInstanceId: zod_1.z.preprocess(query_params_preprocess_1.emptyQueryValueToUndefined, zod_1.z.string().trim().min(1).optional()),
    })
        .strict()),
    body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
exports.createMessageSchema = zod_1.z.object({
    params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z.object({
        title: zod_1.z.string().trim().min(1),
        body: zod_1.z.string().trim().min(1),
        actorId: zod_1.z.string().trim().min(1),
        actorType: (0, string_1.applyLowercaseToZodEnum)(enum_1.workflowInteractionActorTypeZodEnum),
        workflowInstanceId: zod_1.z.string().trim().min(1),
        workflowId: zod_1.z.string().trim().min(1),
        metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).nullable().optional(),
        status: (0, string_1.applyLowercaseToOptionalZodEnum)(enum_1.messageStatusZodEnum),
    }),
});
exports.listActorMessagesResponseSchema = zod_1.z.array(exports.messageItemSchema);
exports.listMessagesResponseSchema = zod_1.z.object({
    items: zod_1.z.array(exports.messageItemSchema),
    nextCursor: zod_1.z.string().nullable(),
});
exports.createMessageResponseSchema = exports.messageItemSchema;
/** Maps a DB row to the wire response shape and validates with `messageItemSchema`. */
function mapMessageRowToResponse(item) {
    return exports.messageItemSchema.parse({
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
