'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.multiWebhookWaitStatusSchema =
  exports.multiWebhookWaitCallbackSchema =
  exports.multiWebhookWaitRegisterSchema =
    void 0;
const zod_1 = require('zod');
/** POST /multi-webhook-wait/register */
exports.multiWebhookWaitRegisterSchema = zod_1.z.object({
  body: zod_1.z.object({
    executionId: zod_1.z.string().min(1, 'executionId is required'),
    resumeUrl: zod_1.z.string().url('resumeUrl must be a valid URL'),
    expectedCalls: zod_1.z
      .array(
        zod_1.z.object({
          matchKey: zod_1.z.string().min(1, 'matchKey is required'),
        }),
      )
      .min(1, 'At least one expected call must be defined'),
  }),
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** POST /multi-webhook-wait/callback/:executionId — called by node's webhook handler */
exports.multiWebhookWaitCallbackSchema = zod_1.z.object({
  body: zod_1.z.object({
    matchKey: zod_1.z.string().min(1, 'matchKey is required'),
    payload: zod_1.z.unknown(),
  }),
  params: zod_1.z.object({
    executionId: zod_1.z.string().min(1, 'executionId is required'),
  }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
/** GET /multi-webhook-wait/status/:executionId */
exports.multiWebhookWaitStatusSchema = zod_1.z.object({
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  params: zod_1.z.object({
    executionId: zod_1.z.string().min(1, 'executionId is required'),
  }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
