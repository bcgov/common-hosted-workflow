"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantProjectExistsResponseSchema = exports.tenantProjectCreatedResponseSchema = exports.associateCredentialResponseSchema = exports.associateWorkflowResponseSchema = exports.getUserProjectResponseSchema = exports.tenantProjectRelationSchema = exports.associateCredentialSchema = exports.associateWorkflowSchema = exports.getUserProjectSchema = void 0;
const zod_1 = require("zod");
const string_1 = require("../utils/string");
exports.getUserProjectSchema = zod_1.z.object({
    params: zod_1.z.object({
        email: zod_1.z.string().min(1),
    }),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
exports.associateWorkflowSchema = zod_1.z.object({
    params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z
        .object({
        workflowId: zod_1.z.unknown(),
        projectId: zod_1.z.unknown(),
        singleOwner: zod_1.z.boolean().optional(),
    })
        .transform((b) => ({
        workflowId: (0, string_1.trimString)(b.workflowId),
        projectId: (0, string_1.trimString)(b.projectId),
        singleOwner: b.singleOwner === true,
    }))
        .refine((b) => Boolean(b.workflowId && b.projectId), {
        message: 'Missing workflowId or projectId in request body.',
    }),
});
exports.associateCredentialSchema = zod_1.z.object({
    params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z
        .object({
        credentialId: zod_1.z.unknown(),
        projectId: zod_1.z.unknown(),
        singleOwner: zod_1.z.boolean().optional(),
    })
        .transform((b) => ({
        credentialId: (0, string_1.trimString)(b.credentialId),
        projectId: (0, string_1.trimString)(b.projectId),
        singleOwner: b.singleOwner === true,
    }))
        .refine((b) => Boolean(b.credentialId && b.projectId), {
        message: 'Missing credentialId or projectId in request body.',
    }),
});
exports.tenantProjectRelationSchema = zod_1.z.object({
    params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z
        .object({
        tenantId: zod_1.z.string().optional(),
        tenant_id: zod_1.z.string().optional(),
        projectId: zod_1.z.string().optional(),
        project_id: zod_1.z.string().optional(),
    })
        .transform((b) => ({
        tenantId: (0, string_1.trimString)(b.tenantId ?? b.tenant_id),
        projectId: (0, string_1.trimString)(b.projectId ?? b.project_id),
    }))
        .refine((b) => Boolean(b.tenantId && b.projectId), {
        message: 'Missing tenantId or projectId in request body.',
    }),
});
exports.getUserProjectResponseSchema = zod_1.z.object({
    user: zod_1.z.unknown(),
    project: zod_1.z.unknown(),
});
exports.associateWorkflowResponseSchema = zod_1.z.object({
    success: zod_1.z.literal(true),
    message: zod_1.z.string(),
});
exports.associateCredentialResponseSchema = zod_1.z.object({
    success: zod_1.z.literal(true),
    message: zod_1.z.string(),
});
exports.tenantProjectCreatedResponseSchema = zod_1.z.object({
    success: zod_1.z.literal(true),
    message: zod_1.z.string(),
});
exports.tenantProjectExistsResponseSchema = zod_1.z.object({
    success: zod_1.z.literal(true),
    message: zod_1.z.string(),
});
