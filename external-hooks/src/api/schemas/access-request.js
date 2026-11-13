"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewAccessRequestResponseSchema = exports.getMyAccessRequestResponseSchema = exports.createAccessRequestResponseSchema = exports.accessRequestListResponseSchema = exports.accessRequestResponseSchema = exports.reviewAccessRequestSchema = exports.listAccessRequestsSchema = exports.createAccessRequestSchema = void 0;
const zod_1 = require("zod");
const string_1 = require("../utils/string");
const accessRequestStatusSchema = zod_1.z.enum(['pending', 'approved', 'denied']);
function parsePositiveInt(value) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
        return Number(value);
    }
    return value;
}
exports.createAccessRequestSchema = zod_1.z.object({
    params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z
        .object({
        justification: zod_1.z.unknown(),
    })
        .transform((body) => ({
        justification: (0, string_1.trimString)(body.justification),
    }))
        .refine((body) => Boolean(body.justification && body.justification.length >= 10), {
        message: 'Justification is required and must be at least 10 characters.',
    }),
});
exports.listAccessRequestsSchema = zod_1.z.object({
    params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    query: zod_1.z
        .object({
        status: zod_1.z.preprocess((v) => (v === '' ? undefined : v), accessRequestStatusSchema.optional()),
        search: zod_1.z.preprocess((v) => (v === '' ? undefined : v), zod_1.z.string().max(200).optional()),
        limit: zod_1.z.preprocess(parsePositiveInt, zod_1.z.number().int().min(1).max(100)).optional(),
        offset: zod_1.z.preprocess(parsePositiveInt, zod_1.z.number().int().min(0)).optional(),
    })
        .optional(),
    body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
exports.reviewAccessRequestSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid({ message: 'Invalid access request ID.' }),
    }),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    body: zod_1.z
        .object({
        action: zod_1.z.enum(['approve', 'deny']),
        denyReason: zod_1.z.string().optional(),
    })
        .transform((body) => ({
        action: body.action,
        denyReason: body.denyReason ? (0, string_1.trimString)(body.denyReason) : undefined,
    }))
        .refine((body) => body.action !== 'deny' || (body.denyReason && body.denyReason.length >= 10), {
        message: 'Deny reason is required and must be at least 10 characters.',
        path: ['denyReason'],
    }),
});
exports.accessRequestResponseSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    requesterEmail: zod_1.z.string().email(),
    justification: zod_1.z.string(),
    status: zod_1.z.enum(['pending', 'approved', 'denied']),
    reviewerEmail: zod_1.z.string().email().nullable(),
    reviewerN8nUserId: zod_1.z.string().nullable(),
    denyReason: zod_1.z.string().nullable(),
    createdAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
});
exports.accessRequestListResponseSchema = zod_1.z.object({
    items: zod_1.z.array(exports.accessRequestResponseSchema),
    total: zod_1.z.number().int().nonnegative(),
});
exports.createAccessRequestResponseSchema = zod_1.z.object({
    accessRequest: exports.accessRequestResponseSchema,
});
exports.getMyAccessRequestResponseSchema = zod_1.z.object({
    accessRequest: exports.accessRequestResponseSchema.nullable(),
});
exports.reviewAccessRequestResponseSchema = zod_1.z.object({
    accessRequest: exports.accessRequestResponseSchema,
});
