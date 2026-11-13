'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.getTriggerChefsTokenResponseSchema =
  exports.getTriggerChefsTokenSchema =
  exports.callbackTriggerResponseSchema =
  exports.callbackTriggerSchema =
  exports.listTriggersSchema =
  exports.deleteTriggerSchema =
  exports.updateTriggerSchema =
  exports.createTriggerSchema =
  exports.updateTriggerResponseSchema =
  exports.createTriggerResponseSchema =
  exports.listTriggersLimitedResponseSchema =
  exports.listTriggersResponseSchema =
  exports.triggerLimitedItemSchema =
  exports.triggerItemSchema =
    void 0;
exports.mapTriggerRowToLimitedResponse = mapTriggerRowToLimitedResponse;
exports.mapTriggerRowToResponse = mapTriggerRowToResponse;
const zod_1 = require('zod');
const enum_1 = require('../constants/enum');
/** Shape of a trigger as returned by the API (no raw credentials). */
exports.triggerItemSchema = zod_1.z.object({
  id: zod_1.z.string(),
  projectId: zod_1.z.string(),
  triggerType: zod_1.z.string(),
  targetKind: enum_1.triggerTargetKindZodEnum,
  targetWorkflowId: zod_1.z.string().nullable(),
  targetNodeId: zod_1.z.string().nullable(),
  /** Live state of an n8n-node target. */
  targetStatus: enum_1.triggerTargetStatusZodEnum.nullable(),
  metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
  allowedActorsType: zod_1.z.string(),
  allowedActors: zod_1.z.array(zod_1.z.string()),
  authEnabled: zod_1.z.boolean(),
  createdAt: zod_1.z.date(),
  updatedAt: zod_1.z.date(),
  createdBy: zod_1.z.string().nullable(),
  updatedBy: zod_1.z.string().nullable(),
});
/** Minimal trigger shape returned to non-editor users — no sensitive fields. */
exports.triggerLimitedItemSchema = zod_1.z.object({
  id: zod_1.z.string(),
  triggerType: enum_1.workflowTriggerTypeZodEnum,
  triggerName: zod_1.z.string(),
  targetStatus: enum_1.triggerTargetStatusZodEnum.nullable(),
  allowedActorsType: zod_1.z.string(),
  allowedActors: zod_1.z.array(zod_1.z.string()),
});
exports.listTriggersResponseSchema = zod_1.z.object({
  data: zod_1.z.array(exports.triggerItemSchema),
});
exports.listTriggersLimitedResponseSchema = zod_1.z.object({
  data: zod_1.z.array(exports.triggerLimitedItemSchema),
});
exports.createTriggerResponseSchema = exports.triggerItemSchema;
exports.updateTriggerResponseSchema = exports.triggerItemSchema;
/** Target fields for create/update. Only WIL Trigger node ('n8n-node') targets are supported. */
const nodeTargetFields = {
  targetKind: zod_1.z.literal('n8n-node'),
  targetWorkflowId: zod_1.z.string().trim().min(1).max(36),
  targetNodeId: zod_1.z.string().trim().min(1).max(36),
};
const withDefaultTargetKind = (body) =>
  typeof body === 'object' && body !== null && !('targetKind' in body) ? { ...body, targetKind: 'n8n-node' } : body;
/** Builds a request body schema for an n8n-node trigger target. */
const triggerBodySchema = (common) =>
  zod_1.z.preprocess(withDefaultTargetKind, zod_1.z.object({ ...nodeTargetFields, ...common }).strict());
/** `*` means "everyone", so it is only valid with the `all` actor type; other types need real identifiers. */
const wildcardOnlyWithAll = {
  check: (body) => body.allowedActorsType === 'all' || !body.allowedActors.some((actor) => actor.trim() === '*'),
  params: { message: "invalid: '*' can only be used when allowedActorsType is 'all'", path: ['allowedActors'] },
};
/** POST /ui-api/wil/triggers */
exports.createTriggerSchema = zod_1.z.object({
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  body: triggerBodySchema({
    triggerType: enum_1.workflowTriggerTypeZodEnum,
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    allowedActorsType: enum_1.triggerActorTypeZodEnum,
    allowedActors: zod_1.z.array(zod_1.z.string()),
    authEnabled: zod_1.z.boolean().optional().default(false),
    createdBy: zod_1.z.string().trim().min(1).optional(),
  }).refine(wildcardOnlyWithAll.check, wildcardOnlyWithAll.params),
});
/** PUT /ui-api/wil/triggers/:triggerId */
exports.updateTriggerSchema = zod_1.z.object({
  params: zod_1.z.object({ triggerId: zod_1.z.string().trim().min(1) }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  body: triggerBodySchema({
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    allowedActorsType: enum_1.triggerActorTypeZodEnum,
    allowedActors: zod_1.z.array(zod_1.z.string()),
    authEnabled: zod_1.z.boolean().optional().default(false),
    updatedBy: zod_1.z.string().trim().min(1).optional(),
  }).refine(wildcardOnlyWithAll.check, wildcardOnlyWithAll.params),
});
/** DELETE /ui-api/wil/triggers/:triggerId */
exports.deleteTriggerSchema = zod_1.z.object({
  params: zod_1.z.object({ triggerId: zod_1.z.string().trim().min(1) }),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** GET /ui-api/wil/triggers */
exports.listTriggersSchema = zod_1.z.object({
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** POST /ui-api/wil/triggers/:triggerId/callback */
exports.callbackTriggerSchema = zod_1.z.object({
  params: zod_1.z.object({ triggerId: zod_1.z.string().trim().min(1) }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** `executionId`/`result` are set for n8n-node targets; `result` only when the node waits for the last node. */
exports.callbackTriggerResponseSchema = zod_1.z.object({
  success: zod_1.z.boolean(),
  executionId: zod_1.z.string().optional(),
  result: zod_1.z.unknown().optional(),
});
/** POST /ui-api/wil/triggers/:triggerId/chefs-token */
exports.getTriggerChefsTokenSchema = zod_1.z.object({
  params: zod_1.z.object({ triggerId: zod_1.z.string().trim().min(1) }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
exports.getTriggerChefsTokenResponseSchema = zod_1.z.object({
  authToken: zod_1.z.string(),
  formId: zod_1.z.string(),
  formName: zod_1.z.string(),
  baseUrl: zod_1.z.string(),
});
/**
 * Maps a DB trigger row to the limited wire response (for non-editor users).
 * Returns only the display name, type, and actor access fields — no URLs, credentials, or metadata.
 */
function mapTriggerRowToLimitedResponse(row, targetStatus = null) {
  const metadata = row.metadata;
  const triggerName =
    row.triggerType === enum_1.WorkflowTriggerTypeEnum.CHEFS_FORM
      ? (metadata.formName ?? '')
      : (metadata.buttonText ?? '');
  return exports.triggerLimitedItemSchema.parse({
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
 * Strips any raw apiKey that somehow survived to the metadata column (defensive);
 * CHEFS form triggers resolve their API key from an n8n credential, so no key is
 * ever returned to the client.
 */
function mapTriggerRowToResponse(row, targetStatus = null) {
  const metadata = { ...row.metadata };
  // Remove any raw apiKey from metadata (should already be stripped, but defensive)
  for (const key of Object.keys(metadata)) {
    if (key.toLowerCase() === 'apikey') {
      delete metadata[key];
    }
  }
  return exports.triggerItemSchema.parse({
    id: row.id,
    projectId: row.projectId,
    triggerType: row.triggerType,
    targetKind: row.targetKind,
    targetWorkflowId: row.targetWorkflowId,
    targetNodeId: row.targetNodeId,
    targetStatus,
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
