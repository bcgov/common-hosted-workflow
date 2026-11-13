'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.authLogoutPrepareResponseSchema =
  exports.authLogoutPrepareSchema =
  exports.authExchangeResponseSchema =
  exports.authExchangeSchema =
  exports.unshareWorkflowResponseSchema =
  exports.unshareWorkflowSchema =
  exports.shareWorkflowResponseSchema =
  exports.shareWorkflowSchema =
    void 0;
const zod_1 = require('zod');
const string_1 = require('../utils/string');
exports.shareWorkflowSchema = zod_1.z.object({
  params: zod_1.z.object({
    workflowId: zod_1.z.string().trim().min(1),
  }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  body: zod_1.z
    .object({
      email: zod_1.z.unknown(),
    })
    .transform((body) => ({
      email: (0, string_1.trimString)(body.email),
    }))
    .refine((body) => Boolean(body.email), { message: 'Missing email in request body.' }),
});
exports.shareWorkflowResponseSchema = zod_1.z.object({
  workflowId: zod_1.z.string(),
  sharedWithEmail: zod_1.z.string(),
});
exports.unshareWorkflowSchema = zod_1.z.object({
  params: zod_1.z.object({
    workflowId: zod_1.z.string().trim().min(1),
    projectId: zod_1.z.string().trim().min(1),
  }),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  body: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
exports.unshareWorkflowResponseSchema = zod_1.z.object({
  workflowId: zod_1.z.string(),
  projectId: zod_1.z.string(),
});
exports.authExchangeSchema = zod_1.z.object({
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  body: zod_1.z.object({
    session: zod_1.z.string().trim().min(1, { message: 'Missing session handle.' }),
  }),
});
exports.authExchangeResponseSchema = zod_1.z.object({
  token: zod_1.z.string(),
});
exports.authLogoutPrepareSchema = zod_1.z.object({
  params: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  query: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
  body: zod_1.z
    .object({
      returnTo: zod_1.z.string().trim().max(2048).optional(),
    })
    .optional(),
});
exports.authLogoutPrepareResponseSchema = zod_1.z.object({
  logoutUrl: zod_1.z.string(),
});
