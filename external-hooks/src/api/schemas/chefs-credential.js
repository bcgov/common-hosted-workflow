"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateChefsCredentialResponseSchema = exports.updateChefsCredentialSchema = exports.createChefsCredentialResponseSchema = exports.createChefsCredentialSchema = exports.listChefsCredentialsSchema = exports.listChefsCredentialsResponseSchema = exports.chefsCredentialSummarySchema = void 0;
const zod_1 = require("zod");
/** Public CHEFS credential. The API key is never part of this shape. */
exports.chefsCredentialSummarySchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    formName: zod_1.z.string(),
    formId: zod_1.z.string(),
    baseUrl: zod_1.z.string(),
    scopes: zod_1.z.array(zod_1.z.string()),
});
exports.listChefsCredentialsResponseSchema = zod_1.z.object({
    data: zod_1.z.array(exports.chefsCredentialSummarySchema),
    canCreate: zod_1.z.boolean(),
});
/** GET /ui-api/wil/chefs-credentials */
exports.listChefsCredentialsSchema = zod_1.z.object({
    params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** POST /ui-api/wil/chefs-credentials */
exports.createChefsCredentialSchema = zod_1.z.object({
    params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z
        .object({
        name: zod_1.z.string().trim().min(3, 'Credential name must be 3 to 128 characters').max(128),
        formName: zod_1.z.string().trim().min(1, 'Form name is required'),
        baseUrl: zod_1.z.string().trim().url('baseUrl must be a valid URL'),
        formId: zod_1.z.string().trim().min(1, 'Form ID is required'),
        apiKey: zod_1.z.string().trim().min(1, 'API key is required'),
    })
        .strict(),
});
exports.createChefsCredentialResponseSchema = exports.chefsCredentialSummarySchema;
/** PATCH /ui-api/wil/chefs-credentials/:credentialId */
exports.updateChefsCredentialSchema = zod_1.z.object({
    params: zod_1.z.object({ credentialId: zod_1.z.string().trim().min(1) }),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z
        .object({
        name: zod_1.z.string().trim().min(3, 'Credential name must be 3 to 128 characters').max(128),
        formName: zod_1.z.string().trim().min(1, 'Form name is required'),
        baseUrl: zod_1.z.string().trim().url('baseUrl must be a valid URL'),
        formId: zod_1.z.string().trim().min(1, 'Form ID is required'),
        // Omit to keep the credential's existing stored API key; provide a non-empty string to rotate it.
        apiKey: zod_1.z.string().trim().min(1).optional(),
    })
        .strict(),
});
exports.updateChefsCredentialResponseSchema = exports.chefsCredentialSummarySchema;
