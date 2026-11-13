"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chefsSubmissionRegisterSchema = exports.chefsSubmissionCallbackSchema = void 0;
const zod_1 = require("zod");
/**
 * POST /chefs/:webhookPath
 *
 * CHEFS Event Subscription payload. `subscriptionEvent` identifies the event type; only
 * `eventSubmission` is forwarded to the n8n webhook (the route gates on it). `formId` /
 * `submissionId` are used to look up a pending resubmission row. Unknown extra fields are allowed.
 */
exports.chefsSubmissionCallbackSchema = zod_1.z.object({
    body: zod_1.z
        .object({
        subscriptionEvent: zod_1.z.string().min(1, 'subscriptionEvent is required'),
        formId: zod_1.z.string().min(1, 'formId is required'),
        submissionId: zod_1.z.string().min(1, 'submissionId is required'),
    })
        .passthrough(),
    params: zod_1.z.object({
        webhookPath: zod_1.z.string().min(1, 'webhookPath is required'),
    }),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** POST /chefs/submissions/register */
exports.chefsSubmissionRegisterSchema = zod_1.z.object({
    body: zod_1.z.object({
        executionId: zod_1.z.string().min(1, 'executionId is required'),
        formId: zod_1.z.string().min(1, 'formId is required'),
        submissionId: zod_1.z.string().min(1, 'submissionId is required'),
        resumeUrl: zod_1.z.string().url('resumeUrl must be a valid URL'),
    }),
    params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
    query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
