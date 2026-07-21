import { z } from 'zod';

/** POST /multi-webhook-wait/register */
export const multiWebhookWaitRegisterSchema = z.object({
  body: z.object({
    executionId: z.string().min(1, 'executionId is required'),
    resumeUrl: z.string().url('resumeUrl must be a valid URL'),
    expectedCalls: z
      .array(
        z.object({
          matchKey: z.string().min(1, 'matchKey is required'),
        }),
      )
      .min(1, 'At least one expected call must be defined'),
  }),
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** POST /multi-webhook-wait/callback/:executionId — called by node's webhook handler */
export const multiWebhookWaitCallbackSchema = z.object({
  body: z.object({
    matchKey: z.string().min(1, 'matchKey is required'),
    payload: z.unknown(),
  }),
  params: z.object({
    executionId: z.string().min(1, 'executionId is required'),
  }),
  query: z.record(z.string(), z.unknown()).optional(),
});

/** GET /multi-webhook-wait/status/:executionId */
export const multiWebhookWaitStatusSchema = z.object({
  body: z.record(z.string(), z.unknown()).optional(),
  params: z.object({
    executionId: z.string().min(1, 'executionId is required'),
  }),
  query: z.record(z.string(), z.unknown()).optional(),
});
