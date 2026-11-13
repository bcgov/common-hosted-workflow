"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerTargetStatusZodEnum = exports.TRIGGER_TARGET_STATUSES = exports.WIL_TRIGGER_INPUT_FIELD_TYPES = exports.WIL_TRIGGER_INPUT_SOURCES = exports.WIL_TRIGGER_RESPOND_MODES = exports.WIL_TRIGGER_SOURCES = exports.TriggerTargetKindEnum = exports.triggerTargetKindZodEnum = exports.TRIGGER_TARGET_KINDS = exports.triggerActorTypeZodEnum = exports.TRIGGER_ACTOR_TYPES = exports.N8N_CREDENTIAL_ID_METADATA_KEY = exports.CHEFS_FORM_AUTH_CREDENTIAL_TYPE = exports.WorkflowTriggerTypeEnum = exports.workflowTriggerTypeZodEnum = exports.WORKFLOW_TRIGGER_TYPES = exports.callbackHttpMethodZodEnum = exports.CALLBACK_HTTP_METHODS = exports.actionRequestPriorityZodEnum = exports.ACTION_REQUEST_PRIORITY_VALUES = exports.actionRequestStatusZodEnum = exports.ACTION_REQUEST_STATUS_VALUES = exports.messageStatusZodEnum = exports.MESSAGE_STATUS_VALUES = exports.workflowInteractionActorTypeZodEnum = exports.WORKFLOW_INTERACTION_ACTOR_TYPES = void 0;
const zod_1 = require("zod");
/**
 * Canonical string unions for workflow-interaction request validation.
 */
/** Shared by messages and action requests (`actor_type` / body `actorType`). */
exports.WORKFLOW_INTERACTION_ACTOR_TYPES = ['user', 'role', 'group', 'system', 'other'];
exports.workflowInteractionActorTypeZodEnum = zod_1.z.enum(exports.WORKFLOW_INTERACTION_ACTOR_TYPES);
/** Message row / create body `status`. */
exports.MESSAGE_STATUS_VALUES = ['active', 'read'];
exports.messageStatusZodEnum = zod_1.z.enum(exports.MESSAGE_STATUS_VALUES);
/** Action request row / body `status`. */
exports.ACTION_REQUEST_STATUS_VALUES = [
    'pending',
    'in_progress',
    'completed',
    'cancelled',
    'expired',
    'deleted',
];
exports.actionRequestStatusZodEnum = zod_1.z.enum(exports.ACTION_REQUEST_STATUS_VALUES);
/** Action request `priority`. */
exports.ACTION_REQUEST_PRIORITY_VALUES = ['critical', 'normal'];
exports.actionRequestPriorityZodEnum = zod_1.z.enum(exports.ACTION_REQUEST_PRIORITY_VALUES);
/** Allowed HTTP verbs for action callback delivery. */
exports.CALLBACK_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'NONE'];
exports.callbackHttpMethodZodEnum = zod_1.z.enum(exports.CALLBACK_HTTP_METHODS);
/** Workflow trigger types. */
exports.WORKFLOW_TRIGGER_TYPES = ['chefs-form', 'button'];
exports.workflowTriggerTypeZodEnum = zod_1.z.enum(exports.WORKFLOW_TRIGGER_TYPES);
/** Named constants for workflow trigger types — prefer these over inline string literals. */
exports.WorkflowTriggerTypeEnum = {
    CHEFS_FORM: 'chefs-form',
    BUTTON: 'button',
};
/**
 * n8n credential type slug for the WIL "CHEFS Form Authentication" credential.
 * Must match the `name` field of the `ChefsFormAuth` credential class in
 * community-nodes (`credentials/ChefsFormAuth.credentials.ts`).
 */
exports.CHEFS_FORM_AUTH_CREDENTIAL_TYPE = 'chefsFormAuth';
/** Trigger metadata key that points at an n8n `chefsFormAuth` credential. */
exports.N8N_CREDENTIAL_ID_METADATA_KEY = 'n8nCredentialId';
/** Actor types for workflow trigger visibility/access control. */
exports.TRIGGER_ACTOR_TYPES = ['all', 'role', 'user', 'group', 'other'];
exports.triggerActorTypeZodEnum = zod_1.z.enum(exports.TRIGGER_ACTOR_TYPES);
/** How a workflow trigger reaches its n8n workflow. `n8n-node` = WIL Trigger node (the only supported kind). */
exports.TRIGGER_TARGET_KINDS = ['n8n-node'];
exports.triggerTargetKindZodEnum = zod_1.z.enum(exports.TRIGGER_TARGET_KINDS);
exports.TriggerTargetKindEnum = {
    N8N_NODE: 'n8n-node',
};
/** Sources a WIL Trigger node can accept (matches `WORKFLOW_TRIGGER_TYPES`). */
exports.WIL_TRIGGER_SOURCES = exports.WORKFLOW_TRIGGER_TYPES;
/** How the WIL Trigger node answers the caller. */
exports.WIL_TRIGGER_RESPOND_MODES = ['immediately', 'lastNode'];
/** `input` handling modes of the WIL Trigger node. */
exports.WIL_TRIGGER_INPUT_SOURCES = ['passthrough', 'workflowInputs'];
/** Field types selectable in the WIL Trigger node's input schema. */
exports.WIL_TRIGGER_INPUT_FIELD_TYPES = ['string', 'number', 'boolean', 'object', 'array'];
/** `targetStatus` of a trigger whose target is an n8n workflow node. */
exports.TRIGGER_TARGET_STATUSES = ['live', 'unpublished', 'missing-node'];
exports.triggerTargetStatusZodEnum = zod_1.z.enum(exports.TRIGGER_TARGET_STATUSES);
